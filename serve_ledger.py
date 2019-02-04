from BaseHTTPServer import BaseHTTPRequestHandler, HTTPServer
import time
import urllib
import json
import sys
import os
import subprocess
import csv
import StringIO
import urlparse
import nacl.secret
import base64
from jose import jwt, jwk
from decimal import Decimal
from boto3.session import Session

from ofxparse import OfxParser
import ofxclient.config
import ofxclient.account
from ofxclient.institution import Institution
from ofxclient.client import DEFAULT_OFX_VERSION
import ofxclient.cli
from ofxhome import OFXHome
import ConfigParser

os.environ['PATH'] = os.environ['PATH'] + ':.'

launch_env = {'LD_LIBRARY_PATH': '.'}

f = open("jwt_keys_url.txt", "r")
JWT_KEYS_URL = f.read().strip()
f.close()

f = open("jwt_issuer.txt", "r")
JWT_ISSUER = f.read().strip()
f.close()

JWT_KEYS = json.loads(urllib.urlopen(JWT_KEYS_URL).read())['keys']

LEDGER_PATH = "/var/ledgereditor"
if os.environ.has_key('LEDGER_PATH'):
    LEDGER_PATH = os.environ['LEDGER_PATH']

def negateamount(amount):
    if amount == "0":
        return amount
    if amount.find('-') >= 0:
        return amount.replace('-', '')
    # hledger's negative signs are weird (next to the number rather than at the far left)
    #  but we will mimic them, to make everything consistent.
    idx = amount.find(filter(lambda st:st.isdigit(), amount)[0])
    return amount[:idx]+'-'+amount[idx:]

def aggregate_total(totals, col, val):
    if not val:
        return
    prefix = ''
    if not val[0].isdigit() and val[0] != '.' and val[0] != '-':
        prefix = val[0]
    postfix = val[val.rfind(filter(lambda st:st.isdigit(), val)[-1])+1:]

    rawval = Decimal(filter(lambda st:st.isdigit() or st == '.' or st == '-', val))
    if totals.has_key(col):
        if not prefix and not totals[col][0].isdigit() and totals[col][0] != '.' and totals[col][0] != '-':
            prefix = totals[col][0]
        if not postfix:
            postfix = totals[col][totals[col].rfind(filter(lambda st:st.isdigit(), totals[col])[-1])+1:]
        rawtotal = Decimal(filter(lambda st:st.isdigit() or st == '.' or st == '-', totals[col]))
        totals[col] = prefix + str(rawtotal + rawval) + postfix
    else:
        totals[col] = val

def fix_column_name(col):
    if col.find('w') >= 0:
        return col[:col.find('w')]
    if col.find('q') >= 0:
        return col.replace('q1', '/01').replace('q2', '/04').replace('q3', '/07').replace('q4', '/10')
    return col

def get_file_from_s3(filename, creds):
    if creds.has_key("cache") and creds["cache"].has_key(filename):
        return creds["cache"][filename]
    if creds.has_key("session"):
        session = creds["session"]
        s3 = creds["s3"]
    else:
        session = Session(aws_access_key_id=creds["awsAccessKeyId"], aws_secret_access_key=creds["awsSecretAccessKey"], aws_session_token=creds["awsSessionToken"])
        s3 = session.resource('s3', region_name="us-east-2")
        creds["session"] = session
        creds["s3"] = s3
    returndata = ""
    try:
        ob = s3.meta.client.head_object(Bucket='ledgeraccounting', Key=creds["ledgerPrefix"]+'/'+filename)
        etag = ob["ETag"]
        etag = etag.strip('"')
        data = ""
        if os.path.exists('/tmp/'+etag):
            f = open('/tmp/'+etag)
            data = f.read()
            f.close()
        else:
            ob=s3.Object('ledgeraccounting', creds["ledgerPrefix"]+'/'+filename)
            getob = ob.get()
            data = getob["Body"].read()
            f = open('/tmp/'+etag, 'w')
            f.write(data)
            f.close()
    
        k = base64.decodestring(creds['encryptionKey'])
        box = nacl.secret.SecretBox(k)
    
        returndata = box.decrypt(base64.decodestring(data))
    except:
        pass

    if not creds.has_key("cache"):
        creds["cache"] = {}
    creds["cache"][filename] = returndata
    return returndata

def save_file_to_s3(filename, data, creds):
    if creds.has_key("session"):
        session = creds["session"]
        s3 = creds["s3"]
    else:
        session = Session(aws_access_key_id=creds["awsAccessKeyId"], aws_secret_access_key=creds["awsSecretAccessKey"], aws_session_token=creds["awsSessionToken"])
        s3 = session.resource('s3', region_name="us-east-2")
        creds["session"] = session
        creds["s3"] = s3
    k = base64.decodestring(creds['encryptionKey'])
    box = nacl.secret.SecretBox(k)
    dataObj = StringIO.StringIO(base64.encodestring(box.encrypt(data.encode('utf-8'))))
    s3.meta.client.upload_fileobj(dataObj, 'ledgeraccounting', creds["ledgerPrefix"]+'/'+filename)

    if not creds.has_key("cache"):
        creds["cache"] = {}
    creds["cache"][filename] = data

def lambda_func(event, context = None):
    beginf = time.time()
    query = event['body']
    gettimes = []
    cmdtimes = []
    result = {}
    if not event['headers'].has_key('Authorization'):
        result['error'] = "Missing Auth Header"
        return result
    token_header_parts = event['headers']['Authorization'].split(" ")
    if len(token_header_parts) != 2 or token_header_parts[0] != "Bearer":
        result['error'] = "Malformed Auth Header"
        return result
    token_string = token_header_parts[1]

    headers = jwt.get_unverified_headers(token_string)

    kid = headers['kid']
    key_index = -1
    for i in range(len(JWT_KEYS)):
        if kid == JWT_KEYS[i]['kid']:
            key_index = i
            break
    if key_index == -1:
        result['error'] = 'Public key not found';
        return result

    try:
        decode = jwt.decode(token_string, JWT_KEYS[key_index], algorithms=['RS256'],issuer=JWT_ISSUER)
    except:
        result['error'] = "Not Authorized"
        return result

    if query['query'] == 'getfile':
        filename = os.path.split(query['filename'])[-1]
        if filename.startswith('online'):
            begin = time.time()
            result['contents'] = get_file_from_s3(filename, query["creds"])
            end = time.time()
            gettimes.append(end-begin)
        else:
            result['error'] = "Filenames must begin with online"
    elif query['query'] == 'savefile':
        filename = os.path.split(query['filename'])[-1]
        if filename.startswith('online'):
            try:
                save_file_to_s3(filename, query['contents'], query["creds"])
                result['success'] = True
            except:
                result['success'] = False
        else:
            result['error'] = "Filenames must begin with online"
    elif query['query'] == 'report':
        command = None
        if query.has_key('name'):
            reportType = None
            historical = "auto"
            if query.has_key('historical'):
                historical = query['historical']

            if query['name'] == "accounts":
                command = ["hledger", "-I", "-f", "-", "accounts"]
                reportType = "accounts"
            elif query['name'] == "budget":
                command = ["hledger", "-I", "-f", "-", "accounts", "^Income|^Expenses"]
                reportType = "budget"
            else:
                if query['name'] == "balance":
                    command = ["hledger", "-f" , "-", "balance", "--tree", "-O", "csv"]
                    reportType = "balance"
                    if historical == "includehistorical":
                        command.append('-H')
                        historical = None
                elif query['name'] == "register" or query['name'] == "budgetregister" or query['name'] == "combinedregister":
                    if query['name'] == "combinedregister":
                        command = ["hledger", "-I", "-f" , "-", "register", "-O", "csv"]
                    else:
                        command = ["hledger", "-f" , "-", "register", "-O", "csv"]
                    if historical == "auto" or historical == "includehistorical":
                        command.append('-H')
                        historical = None
                    reportType = query['name']
                if command and query.has_key('time'):
                    command.append('-p')
                    command.append(query['time'])
                if command and query.has_key('timeperiod'):
                    if query['timeperiod'] in ['monthly', 'weekly', 'yearly', 'quarterly', 'daily']:
                        command.append('--' + query['timeperiod'])
                if command and query.has_key('accounts'):
                    parts = query['accounts'].split('_')
                    if len(parts) > 1 and parts[1]:
                        command.append('^'+parts[1])
                        if historical == "auto" and ((parts[1].startswith('Assets:') or parts[1].startswith('Liabailities:'))):
                            command.append('-H')
                    else:
                        if parts[0] == "expenses":
                            command.append('^Expenses:')
                        elif parts[0] == "income":
                            command.append('^Income:')
                        elif parts[0] == "incomeexpenses":
                            command.append('^Income:|^Expenses:')
                        elif parts[0] == "assets":
                            command.append('^Assets:')
                            if historical == "auto":
                                command.append('-H')
                        elif parts[0] == "assetssummary":
                            command.append('^Assets:')
                            command.append('--depth')
                            command.append('2')
                            if historical == "auto":
                                command.append('-H')
                        elif parts[0] == "liabilities":
                            command.append('^Liabilities:')
                            if historical == "auto":
                                command.append('-H')
                        elif parts[0] == "assetsliabilities":
                            command.append('^Assets:|^Liabilities:')
                            if historical == "auto":
                                command.append('-H')
        if command:
            if reportType == "budget" or reportType == "accounts" or reportType == "combinedregister":
                begin = time.time()
                defaultledger = get_file_from_s3("online.ledger", query["creds"])
                end = time.time()
                gettimes.append(end-begin)
                begin = time.time()
                budgetledger = get_file_from_s3("onlinebudget.ledger", query["creds"])
                end = time.time()
                gettimes.append(end-begin)
                begin = time.time()
                output, errors = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=launch_env).communicate(defaultledger+os.linesep+budgetledger)
                end = time.time()
                cmdtimes.append(end-begin)
            elif reportType == "budgetregister":
                begin = time.time()
                budgetledger = get_file_from_s3("onlinebudget.ledger", query["creds"])
                end = time.time()
                gettimes.append(end-begin)
                begin = time.time()
                output, errors = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=launch_env).communicate(budgetledger)
                end = time.time()
                cmdtimes.append(end-begin)
            else:
                begin = time.time()
                defaultledger = get_file_from_s3("online.ledger", query["creds"])
                end = time.time()
                gettimes.append(end-begin)
                begin = time.time()
                output, errors = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=launch_env).communicate(defaultledger)
                end = time.time()
                cmdtimes.append(end-begin)
            if errors:
                result["error"] = "Report failed: " +errors
            else:
                try:
                    items = []
                    if reportType == "accounts":
                        result = {"result": output.splitlines()}
                    elif reportType == "budget":
                        allaccounts = output.splitlines()
                        command = ["hledger", "-I", "-f" , "-", "accounts", "^Assets:|^Liabilities:"]
                        begin = time.time()
                        budgettrackedaccounts, errors = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=launch_env).communicate(budgetledger)
                        end = time.time()
                        cmdtimes.append(end-begin)
                        accounts = allaccounts + budgettrackedaccounts.splitlines()
                        # Budget report involves 3 reports with various inputs
                        command = ["hledger", "-I", "-f" , "-", "balance", "--tree", "-O", "csv", "-E", "-p", query.get('time', ['thismonth'])]
                        if query.has_key('budgetperiod') and query['budgetperiod'] in ['monthly', 'weekly', 'yearly', 'quarterly', 'daily']:
                            command.append('--' + query['budgetperiod'])
                        else:
                            command.append('--monthly')
                        begin = time.time()
                        budgetoutput, errors = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=launch_env).communicate(budgetledger)
                        end = time.time()
                        cmdtimes.append(end-begin)
                        if errors:
                            result["error"] = "Budget report failed: " +errors
                        else:
                            command = ["hledger", "-f" , "-", "balance", "--tree", "-O", "csv", "-E", "-p", query.get('time', ['thismonth'])]
                            if query.has_key('timeperiod') and query['timeperiod'] in ['monthly', 'weekly', 'yearly', 'quarterly', 'daily']:
                                command.append('--' + query['timeperiod'])
                            else:
                                command.append('--monthly')
                            begin = time.time()
                            spendingoutput, errors = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=launch_env).communicate(defaultledger)
                            end = time.time()
                            cmdtimes.append(end-begin)
                            if errors:
                                result["error"] = "Budget spending report failed: " +errors
                            else:
                                command = ["hledger", "-I", "-f" ,"-", "balance", "--tree", "-O", "csv", "-E", "-H", "-p", query.get('time', ['thismonth'])]
                                if query.has_key('timeperiod') and query['timeperiod'] in ['monthly', 'weekly', 'yearly', 'quarterly', 'daily']:
                                    command.append('--' + query['timeperiod'])
                                else:
                                    command.append('--monthly')

                                begin = time.time()
                                balanceoutput, errors = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=launch_env).communicate(defaultledger+os.linesep+budgetledger)
                                end = time.time()
                                cmdtimes.append(end-begin)
                                if errors:
                                    result["error"] = "Budget balance report failed: " +errors
                                else:
                                    budgetitems = {}
                                    spendingitems = {}
                                    balanceitems = {}
                                    reader = csv.DictReader(StringIO.StringIO(budgetoutput))
                                    budgetcolumns = []
                                    reportcolumns = []
                                    columns = []
                                    foundbudgetkeys = False
                                    foundspendingkeys = False
                                    foundbalancekeys = False
                                    for row in reader:
                                        if row['Account'] != "total":
                                            if not foundbudgetkeys:
                                                for col in row.keys():
                                                    fixedcol = fix_column_name(col)
                                                    if fixedcol[0].isdigit() and fixedcol not in budgetcolumns:
                                                        budgetcolumns.append(fixedcol)
                                                        columns.append((fixedcol, 0, "Budget "+fixedcol, col))
                                                foundbudgetkeys = True
                                            budgetitems[row['Account']] = row
                                    reader = csv.DictReader(StringIO.StringIO(spendingoutput))
                                    for row in reader:
                                        if row['Account'] != "total":
                                            if not foundspendingkeys:
                                                for col in row.keys():
                                                    fixedcol = fix_column_name(col)
                                                    if fixedcol[0].isdigit() and fixedcol not in reportcolumns:
                                                        reportcolumns.append(fixedcol)
                                                        columns.append((fixedcol, 1, "Actual "+fixedcol, col))
                                                        columns.append((fixedcol, 2, "Balance "+fixedcol, col))
                                                foundspendingkeys = True
                                            spendingitems[row['Account']] = row
                                    reader = csv.DictReader(StringIO.StringIO(balanceoutput))
                                    for row in reader:
                                        if row['Account'] != "total":
                                            if not foundbalancekeys:
                                                for col in row.keys():
                                                    fixedcol = fix_column_name(col)
                                                    if col[0].isdigit() and fixedcol not in reportcolumns:
                                                        reportcolumns.append(fixedcol)
                                                        columns.append((fixedcol, 1, "Actual "+fixedcol, col))
                                                        columns.append((fixedcol, 2, "Balance "+fixedcol, col))
                                                foundbalancekeys = True
                                            balanceitems[row['Account']] = row
                                    # Now assemble header row
                                    header = ['account']
                                    columns.sort()
                                    firstbudget = -1
                                    firstbudgetidx = 0
                                    for col, order, colname, lookupcol in columns:
                                        if firstbudget < 0:
                                            if order == 0:
                                                firstbudget = firstbudgetidx
                                            else:
                                                firstbudgetidx += 1
                                                continue
                                        header.append(colname)
                                    if firstbudgetidx >= 0:
                                        columns = columns[firstbudgetidx:]
                                    # Now assemble report rows
                                    totals = {'account': 'Total'}
                                    for acct in accounts:
                                        if budgetitems.has_key(acct) or spendingitems.has_key(acct) or balanceitems.has_key(acct):
                                            row = {'account': acct}
                                            for col, order, colname, lookupcol in columns:
                                                if order == 0: # Budget column
                                                    if budgetitems.has_key(acct) and budgetitems[acct].has_key(lookupcol):
                                                        row[colname] = negateamount(budgetitems[acct][lookupcol])
                                                    else:
                                                        row[colname] = "0"
                                                elif order == 1: # Actual column
                                                    if spendingitems.has_key(acct) and spendingitems[acct].has_key(lookupcol):
                                                        row[colname] = negateamount(spendingitems[acct][lookupcol])
                                                    else:
                                                        row[colname] = "0"
                                                elif order == 2: # Balance column
                                                    if balanceitems.has_key(acct) and balanceitems[acct].has_key(lookupcol):
                                                        row[colname] = negateamount(balanceitems[acct][lookupcol])
                                                    else:
                                                        row[colname] = "0"
                                                aggregate_total(totals, colname, row[colname])
                                            items.append(row)
                                    items.append(totals)
                                    result["headers"] = header
                                    result["result"] = items

                    else:
                        reader = csv.DictReader(StringIO.StringIO(output))
                        for row in reader:
                            if reportType == "budgetregister" or reportType == "combinedregister":
                                for k in row.keys():
                                    if k != "txnidx" and k != "date" and k != "description" and k != "account":
                                        row[k] = negateamount(row[k])
                            items.append(row)
                        result["headers"] = reader.fieldnames
                        result["result"] = items
                except:
                    result["error"] = "Report failed to produce readable results"
        else:
            result["error"] = "Bad report parameters"
    elif query['query'] == 'validate':
        options = ["-I"] 
        if query.has_key('assertions') and query['assertions']:
            options = []
        command = ["hledger", "-f" ,"-"]+options+["print"]
        ledger = query['contents']
        begin = time.time()
        validateoutput, errors = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=launch_env).communicate(ledger)
        end = time.time()
        cmdtimes.append(end-begin)
        if validateoutput:
            result["output"] = validateoutput
        if errors:
            result["error"] = errors

    elif query['query'] == 'parseofx':
        ofxdata = query['contents']
        parser = OfxParser.parse(StringIO.StringIO(ofxdata))
        convdate = lambda d: ("%0.4d/%0.2d/%0.2d" % (d.year, d.month, d.day)) if d is not None and hasattr(d, 'year') else None
        strifnotnone = lambda s:str(s) if s is not None else s

        result["ofxaccounts"] =  [{"fid": getattr(account.institution, "fid", None), "organization": getattr(account.institution, "organization", None), "account_id": getattr(account, "account_id", None), "number": getattr(account, "number", None), "routing_number": getattr(account, "routing_number", None), "type": getattr(account, "type", None), "account_type": getattr(account, "account_type", None), "statement": {"available_balance": strifnotnone(getattr(account.statement, "available_balance", None)), "available_balance_date": convdate(getattr(account.statement, "available_balance_date", None)), "balance": strifnotnone(getattr(account.statement, "balance", None)), "balance_date": convdate(getattr(account.statement, "balance_date", None)), "start_date": convdate(getattr(account.statement, "start_date", None)), "end_date": convdate(getattr(account.statement, "end_date", None)), "currency": getattr(account.statement, "currency", None), "transactions": [{"amount":strifnotnone(txn.amount), "checknum": getattr(txn, "checknum", None), "date": convdate(getattr(txn, "date", None)), "id": getattr(txn, "id", None), "mcc": getattr(txn, "mcc", None), "memo": getattr(txn, "memo", None), "payee": getattr(txn, "payee", None), "sic": getattr(txn, "sic", None), "type": getattr(txn, "type", None)} for txn in account.statement.transactions]}} for account in parser.accounts]

    elif query['query'] == 'downloadofx':
        try:
        #    config = ConfigParser.ConfigParser()
        #    config.readfp(StringIO.StringIO(query['ofxconfig']))
        #    ofxclient.config.unflatten_dict(dict(config.items(config.sections()[0])))
        #    acct = ofxclient.account.Account.deserialize(ofxclient.config.unflatten_dict(dict(config.items(config.sections()[0]))))
            acct = ofxclient.account.Account.deserialize(query['ofxconfig'])
            dat = acct.download()
            result["contents"] = dat.read()
        except Exception as ex:
            result["error"] = str(ex)

    elif query['query'] == 'searchofxhome':
        try:
            result["result"] = list(OFXHome.search(query['search']))
        except Exception as ex:
            result["error"] = str(ex)

    elif query['query'] == 'getofxaccounts':
        try:
            version = DEFAULT_OFX_VERSION
            if query.has_key('ofx_version'):
                version = int(query['ofx_version'])
            bank_info = OFXHome.lookup(query['ofxhomeid'])
            if bank_info:
                i = Institution(
                    id=bank_info['fid'],
                    org=bank_info['org'],
                    url=bank_info['url'],
                    broker_id=bank_info['brokerid'],
                    description=bank_info['name'],
                    username=query['username'],
                    password=query['password'],
                    client_args=ofxclient.cli.client_args_for_bank(bank_info, version))
                failed = False
                try:
                    i.authenticate()
                except Exception as ex:
                    failed = True
                    result["error"] = "Authentication failed: "+str(ex)
                if not failed:
                    accts = i.accounts()
                    result["result"] = [acct.serialize() for acct in accts]
            else:
                result["error"] = "Could not find bank"
        except Exception as ex:
            result["error"] = "Failure: "+str(ex)
    else:
        result["error"] = "Bad query"

    endf = time.time()
    result["log"] = {"totaltime": (endf-beginf), "gettimes": gettimes, "cmdtimes": cmdtimes}
    return result

class S(BaseHTTPRequestHandler):
    extensions_to_serve = [".html", ".css", ".js", ".json", ".woff"]
    def _set_headers(self, ext = ".html"):
        self.send_response(200)
        if ext == ".html":
            self.send_header('Content-type', 'text/html')
        elif ext == ".js":
            self.send_header('Content-type', "application/javascript")
        elif ext == ".css":
            self.send_header('Content-type', "text/css")
        elif ext == ".json":
            self.send_header('Content-type', "application/json")
        elif ext == ".woff":
            self.send_header('Content-type', "application/font-woff")
        elif ext == ".ledger":
            self.send_header('Content-type', "text/plain")
        self.end_headers()

    def do_GET(self):
        path = self.path.split('/')[-1]
        if not path:
            path = "index.html"

        if os.path.exists(path) and os.path.splitext(path)[1] in self.extensions_to_serve:
            self._set_headers(os.path.splitext(path)[1])
            f = open(path, "r")
            self.wfile.write(f.read())
            f.close()
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write("Not found")

    def do_HEAD(self):
        self._set_headers()

    def do_POST(self):
        params = self.rfile.read(int(self.headers['Content-Length']))
        query = json.loads(params)
        event = {"method": "POST", "body": query, "headers": self.headers}
        beginf = time.time()
        result = lambda_func(event)
        endf = time.time()
        sys.stderr.write("Lambda function took: "+str(endf-beginf)+"\n")
        self._set_headers('.json')
        self.wfile.write(json.dumps(result))


def run(server_class=HTTPServer, handler_class=S, port=8888):
    server_address = ('0.0.0.0', port)
    httpd = server_class(server_address, handler_class)
    print 'Starting httpd...'
    httpd.serve_forever()

if __name__ == "__main__":
    from sys import argv

    if len(argv) == 2:
        run(port=int(argv[1]))
    else:
        run()
