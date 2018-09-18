function invertAmount(amount) {
  if (amount.indexOf('-') >= 0)
  {
    return amount.replace('-', '');
  }
  else if (amount == '0')
  {
    return amount;
  }
  else if (amount.search(/\d/) >= 0)
  {
    return amount.slice(0, amount.search(/\d/)) + '-' + amount.slice(amount.search(/\d/));
  }
  else
  {
    return '-' + amount;
  }
}

function isAmericanCurrency(amount) {
    var r = /^\-?\$?\-?[0-9]+(\.[0-9][0-9])?$/;
    if(r.test(amount))
    {
        return true;
    }
    else
    {
        return false;
    }
}

function getDayIndex(dateStr) {
    var date = new Date(dateStr);
    if (date)
    {
        return Math.floor(date.valueOf() / 1000.0 / 60.0 / 60.0 / 24.0);
    }
    else
    {
        return 0;
    }
}

function ledger2objects(data, invert) {
    var lines = data.split(/\r?\n/);

    var insideTransaction = false;
    var insidePosting = false;
    var currentTransaction = {};
    var currentPosting = {};
    var transactionList = [];
    for (var lineNum in lines)
    {
        var line = lines[lineNum];
        if (!insideTransaction)
        {
            if (line.search(/[0-9]*\/[0-9]*\/[0-9]*/) == 0)
            {
                insideTransaction = true;
                var firstSpace = line.search(" ");
                if (firstSpace >= 0)
                {
                    currentTransaction["date"] = line.slice(0, firstSpace);
                    currentTransaction["dayIndex"] = getDayIndex(currentTransaction["date"]);
                    var remainingLine = line.slice(firstSpace + 1);
                    if (remainingLine.slice(0, 2) == "! " || remainingLine.slice(0, 2) == "* ")
                    {
                        currentTransaction["status"] = remainingLine[0];
                        remainingLine = remainingLine.slice(2);
                    }
                    var nextSpace = remainingLine.search(" ");
                    if (nextSpace >= 0 && remainingLine[0] == "(" && remainingLine[nextSpace-1] == ")")
                    {
                        currentTransaction["code"] = remainingLine.slice(1, nextSpace - 1);
                        remainingLine = remainingLine.slice(nextSpace + 1);
                    }
                    var commentIndex = remainingLine.search(";");
                    if (commentIndex >= 0)
                    {
                        currentTransaction["comment"] = remainingLine.slice(commentIndex + 1).trim();
                        remainingLine = remainingLine.slice(0, commentIndex - 1).trim();
                    }
                    currentTransaction["payee"] = remainingLine;
                }
            }
            else
            {
                console.log("ERROR: Unknown transaction start line: "+line);
            }
        }
        else
        {
            if (line.trim().length > 0 && (line[0] == " " || line[0] == "\t"))
            {
                var trimmedLine = line.trim();
                if (trimmedLine[0] == ";")
                {
                    // New block comment
                    if (insidePosting)
                    {
                        if (!currentPosting["blockcomments"])
                        {
                            currentPosting["blockcomments"] = [];
                        }
                        currentPosting["blockcomments"].push(trimmedLine.slice(1).trim());
                    }
                    else
                    {
                        if (!currentTransaction["blockcomments"])
                        {
                            currentTransaction["blockcomments"] = [];
                        }
                        currentTransaction["blockcomments"].push(trimmedLine.slice(1).trim());
                    }
                }
                else
                {
                    // New posting
                    if (insidePosting)
                    {
                        currentTransaction["postings"].push(currentPosting);
                        currentPosting = {};
                    }
                    else
                    {
                       insidePosting = true;
                    }
                    if (!currentTransaction["postings"])
                    {
                        currentTransaction["postings"] = [];
                    }
                    if (trimmedLine.slice(0, 2) == "! " || trimmedLine.slice(0, 2) == "* ")
                    {
                        currentPosting["status"] = trimmedLine[0];
                        trimmedLine = trimmedLine.slice(2);
                    }
                    var endOfAccountName = trimmedLine.search(/\s\s/);
                    if (endOfAccountName >= 0 && trimmedLine.slice(0, endOfAccountName).trim().length > 0)
                    {
                        currentPosting["account"] = trimmedLine.slice(0, endOfAccountName);
                        var amount = trimmedLine.slice(endOfAccountName).trim();
                        if (amount.search(";") >= 0)
                        {
                            currentPosting["comment"] = amount.slice(amount.search(";") + 1).trim();
                            currentPosting["amount"] = amount.slice(0, amount.search(";")).trim();
                            trimmedLine = trimmedLine.slice(0, trimmedLine.search(";")).trim();
                            currentPosting["width"] = trimmedLine.length + 4;
                        }
                        else
                        {
                            currentPosting["amount"] = amount.trim();
                            currentPosting["width"] = trimmedLine.length + 4;
                        }
                        if (invert && isAmericanCurrency(currentPosting["amount"]))
                        {
                            currentPosting["amount"] = invertAmount(currentPosting["amount"]);
                        }
                    }
                    else
                    {
                        currentPosting["account"] = trimmedLine;
                        // Preserve width to make diffs pretty
                        if (line.length != trimmedLine.length + 4)
                        {
                            currentPosting["width"] = line.length;
                        }
                    }
                }
            }
            else
            {
                if (insidePosting)
                {
                    currentTransaction["postings"].push(currentPosting);
                    insidePosting = false;
                    currentPosting = {};
                }
                transactionList.push(currentTransaction);
                insideTransaction = false;
                currentTransaction = {};
            }
        }
    }
    if (insideTransaction)
    {
        if (insidePosting)
        {
            currentTransaction["postings"].push(currentPosting);
        }
        transactionList.push(currentTransaction);
    }
    return transactionList;
}

function objects2ledger(records, invert) {
    var ledgerstring = "";
    for (var i = 0; i < records.length; i++)
    {
        var status = "";
        var code = "";
        var comment = "";
        if (records[i].status)
        {
            status = " " + records[i].status;
        }
        if (records[i].code)
        {
            code = " (" + records[i].code + ")";
        }
        if (records[i].comment)
        {
            comment = "    ; " + records[i].comment;
        }
        ledgerstring += records[i].date + status + code + " " + records[i].payee + comment + "\n";
        if (records[i].blockcomments)
        {
            for (var j = 0; j < records[i].blockcomments.length; j++)
            {
                ledgerstring += "    ; " + records[i].blockcomments[j] + "\n";
            }
        }
        if (records[i].postings)
        {
            for (var j = 0; j < records[i].postings.length; j++)
            {
                var padding = "";
                var status = "";
                var amount = "";
                var comment = "";
                if (records[i].postings[j].status)
                {
                    status = records[i].postings[j].status + " ";
                }
                if (records[i].postings[j].comment)
                {
                    comment = "    ; " + records[i].postings[j].comment;
                }
                if (records[i].postings[j].amount)
                {
                    amount = records[i].postings[j].amount;
                    if (invert && isAmericanCurrency(amount))
                    {
                        amount = invertAmount(amount);
                    }
                    var proposedPadding = 60 - records[i].postings[j].account.length - amount.length - 4;
                    if (records[i].postings[j].width)
                    {
                        proposedPadding = records[i].postings[j].width - records[i].postings[j].account.length -
                                          amount.length - 4;
                    }
                    // Always at LEAST 2
                    padding = " ".repeat(Math.max(proposedPadding, 2));
                }
                else
                {
                    if (records[i].postings[j].width)
                    {
                        var proposedPadding = records[i].postings[j].width - records[i].postings[j].account.length - 4;
                        if (proposedPadding > 0)
                        {
                            padding = " ".repeat(Math.max(proposedPadding, 2));
                        }
                    }
                }
                ledgerstring += "    " + status + records[i].postings[j].account + padding + amount + comment + "\n";
                if (records[i].postings[j].blockcomments)
                {
                    for (var k = 0; k < records[i].postings[j].blockcomments.length; k++)
                    {
                        ledgerstring += "    ; " + records[i].postings[j].blockcomments[k] + "\n";
                    }
                }
            }
        }
        ledgerstring += "\n";
    }
    return ledgerstring;
}

function pad(n, width, z) {
  z = z || '0';
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

function changeToAmericanCurrency(changeTo)
{
    if (changeTo.indexOf('$') < 0)
    {
        changeTo = "$" + changeTo;
    }
    if (changeTo.indexOf('.') < 0)
    {
        changeTo = changeTo + '.00';
    }
    if (changeTo.indexOf('.') == changeTo.length - 1)
    {
        changeTo = changeTo + '00';
    }
    if (changeTo.indexOf('.') == changeTo.length - 2)
    {
        changeTo = changeTo + '0';
    }
    return changeTo;
}
