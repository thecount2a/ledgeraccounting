// Account manager controller and financial data importing
app.controller('AccountManagerCtrl', function ($scope, $rootScope, $http, $uibModalInstance, $uibModal) {

  $scope.accounts = [];
  $scope.tabState = 'accounts';

  $scope.classifier = null;

  $scope.classifyTransformPayee = function(payee, amount)
  {
    var transform = payee.replace(/ \* .*/g, "");
    transform = transform.replace(/[^a-zA-Z ']+/g, "").replace(/[ ]+/g, " ").replace(/^ /, "").replace(/ $/, "")
    if (transform == "Check" && amount)
    {
      transform = transform + " " + amount.replace('-', '').replace('$', '').replace('.', '');
    }
    return transform;
  }

  $scope.totalMatch = {};
  $scope.savedProps = {'importType':true, 'endofacct': true, 'ofxInfo':true, 'ofxInfoDescription':true};

  $scope.newlyAddedAccounts = {};

  $scope.newAccount= function() {
      var modalInstance = $uibModal.open({
        animation: true,
        templateUrl: 'newaccount.html',
        controller: 'NewAccountCtrl',
        resolve: { expenseincome: false }
      });

      modalInstance.result.then(function (info) {
          var found = false;
          for (var i = 0; i < $scope.accounts.length; i++)
          {
            if ($scope.accounts[i].name == info.name)
            {
                found = true;
                break;
            }
          }
          if (!found)
          {
            $scope.newlyAddedAccounts[info.name] = {initialbalance: info.initialbalance};
            $scope.accounts.push({idx: $scope.accounts.length, domid: "file"+$scope.accounts.length.toString(), name: info.name, importType: ""});
          }
          else
          {
            alert("An account with that name already exists: "+info.name);
          }
      });
  };

  $scope.addAccounts = function(acctdata) {
    if (!$scope.index.ledgers[$rootScope.ledgerIndex].accountInfo)
    {
        $scope.index.ledgers[$rootScope.ledgerIndex].accountInfo = {};
    }
    var accounts = [];
    for (var i = 0; i < acctdata.result.length; i++)
    {
        if (acctdata.result[i].startsWith("Assets:") || acctdata.result[i].startsWith("Liabilities:"))
        {
            accounts.push({idx: i, domid: "file"+i.toString(), name: acctdata.result[i]});
        }
        if ($scope.index.ledgers[$rootScope.ledgerIndex].accountInfo[acctdata.result[i]])
        {
          for (var prop in $scope.savedProps)
          {
              if ($scope.index.ledgers[$rootScope.ledgerIndex].accountInfo[acctdata.result[i]][prop])
              {
                  accounts[accounts.length-1][prop] = $scope.index.ledgers[$rootScope.ledgerIndex].accountInfo[acctdata.result[i]][prop];
              }
          }
        }
    }
    $scope.accounts = accounts;
  }

  // Load account names
  $rootScope.enableOverlay();
  $http.post($rootScope.apihost+"/", {"query": "report", "name": "accounts", "creds": $rootScope.creds})
      .success(function(acctdata) {
        $rootScope.getIndex($scope, function(error) {
          $rootScope.disableOverlay();
          if (error)
          {
             alert("Could not load existing index information.");
          }
          else
          {
             console.log("Successfully loaded index");
             $scope.addAccounts(acctdata);
          }
      });
  }).error(function(data) {
    $rootScope.disableOverlay();
  });

  $scope.ok = function () {
    var tempTxns = angular.copy($scope.ledgerSet[0]);
    var addedTxns = 0;
    for (var i = 0; i < $scope.accounts.length; i++)
    {
        for (var prop in $scope.savedProps)
        {
            if ($scope.accounts[i][prop])
            {
                if (!$scope.index.ledgers[$rootScope.ledgerIndex].accountInfo)
                {
                    $scope.index.ledgers[$rootScope.ledgerIndex].accountInfo = {};
                }
                if (!$scope.index.ledgers[$rootScope.ledgerIndex].accountInfo[$scope.accounts[i]['name']])
                {
                    $scope.index.ledgers[$rootScope.ledgerIndex].accountInfo[$scope.accounts[i]['name']] = {};
                }
                $scope.index.ledgers[$rootScope.ledgerIndex].accountInfo[$scope.accounts[i]['name']][prop] = $scope.accounts[i][prop];
            }
            else
            {
                if ($scope.index.ledgers[$rootScope.ledgerIndex].accountInfo && 
                    $scope.index.ledgers[$rootScope.ledgerIndex].accountInfo[$scope.accounts[i]['name']] && 
                    $scope.index.ledgers[$rootScope.ledgerIndex].accountInfo[$scope.accounts[i]['name']][prop])
                {
                    delete $scope.index.ledgers[$rootScope.ledgerIndex].accountInfo[$scope.accounts[i]['name']][prop];
                    if (!$scope.index.ledgers[$rootScope.ledgerIndex].accountInfo[$scope.accounts[i]['name']])
                    {
                        delete $scope.index.ledgers[$rootScope.ledgerIndex].accountInfo[$scope.accounts[i]['name']];
                    }
                }
            }
        }

        
        if ($scope.newlyAddedAccounts[$scope.accounts[i].name])
        {
            var initialbal = {};
            var dateobj = $scope.newlyAddedAccounts[$scope.accounts[i].name].balance_date ? $scope.newlyAddedAccounts[$scope.accounts[i].name].balance_date : new Date();
            initialbal.date = dateobj.getFullYear() + "/" + pad(dateobj.getMonth()+1, 2) + "/" + pad(dateobj.getDate(), 2)
            initialbal.payee = "Initial Balance";
            initialbal.status = "*";
            initialbal.postings = [{account: $scope.accounts[i].name, amount: $scope.newlyAddedAccounts[$scope.accounts[i].name].initialbalance}, {account: "Equity:Initial"}];
            tempTxns.unshift(initialbal);
            addedTxns++;
        }
    }

    // Save index
    var box = nacl.secretbox(nacl.util.decodeUTF8(JSON.stringify($scope.index)), $scope.indexNonceBuff, $rootScope.localEncryptionKeyBuff);
    var newIndexPair = nacl.util.encodeBase64($scope.indexNonceBuff) + ":" + nacl.util.encodeBase64(box);
    $rootScope.enableOverlay();
    $rootScope.s3.putObject({ Bucket: "ledgeraccounting", Key: $rootScope.creds.awsIdentityId + "/index", Body: newIndexPair }, function(error, data) {
        $rootScope.disableOverlay();
        if (error)
        {
            alert(error);
        }
        else
        {
            console.log("Successfully saved updated index");
        }
    }); 
    
    if (addedTxns)
    {
        var newLedger = objects2ledger(tempTxns);
        $rootScope.enableOverlay();
        $http.post($rootScope.apihost+"/", {"query": "savefile", "filename": "/online.ledger", "contents": newLedger, "creds": $rootScope.creds})
          .success(function(data) {
            $rootScope.disableOverlay();
            if (data.error)
            {
              alert("Failed to save ledger data for newly created accounts: " + data.error);
            }
            else
            {
              console.log("Successfully saved ledger data for newly created account");
            }
          })
          .error(function(data) {
            $rootScope.disableOverlay();
            alert("Failed to save ledger data for newly created accounts");
          });
    }
    
    $uibModalInstance.close();
  };


  $scope.testForDate = function(val) {
     if(val.startsWith("date:"))
     {
         return true;
     }
     else
     {
         return false;
     }
  };

  $scope.numTransactions = function(ttype, account, init) {
    var num = init;
    for (var i = 0; i < $scope.accounts.length; i++)
    {
      if ((account == -1 || $scope.accounts[i].name == account) && typeof $scope.accounts[i].nTxnIndex == "object" && $scope.accounts[i].nTxnIndex !== null)
      {
        if (num < 0)
        {
            num = 0;
        }
        if (ttype == "all")
        {
          num += $scope.accounts[i].nTxnIndex.length;
        }
        else
        {
          for (var j = 0; j < $scope.accounts[i].nTxnIndex.length; j++)
          {
            if (ttype == "new" && !$scope.accounts[i].nTxnIndex[j].duplicateflag)
            {
              num++;
            }
            else if (ttype == "duplicate" && $scope.accounts[i].nTxnIndex[j].duplicateflag)
            {
              num++;
            }
          }
        }
      }
    }
    return num;
  }

  $scope.objects2ledger = objects2ledger;

  $scope.getDayIndexForTransaction = function(txn, posting) {
    var dayIndex = 0;
    // Posting of -1 means to search all postings
    for (var i = (posting >= 0 ? posting : 0); i < (posting >= 0 ? posting : txn.postings.length); i++)
    {
      if(txn.postings[i].dayIndex)
      {
          dayIndex = txn.postings[i].dayIndex;
          break;
      }
      else if(txn.postings[i].blockcomments && txn.postings[i].blockcomments.filter($scope.testForDate).length > 0)
      {
          dayIndex = getDayIndex(txn.postings[i].blockcomments.filter($scope.testForDate)[0].slice(5).trim());
          break;
      }
    }
    if(txn.dayIndex)
    {
      dayIndex = txn.dayIndex;
    }
    else if(txn.date)
    {
      dayIndex = getDayIndex(txn.date);
    }
    return dayIndex;
  };

  $scope.generateIndex = function(lists, account) {
    var index = [];
    for (var i = 0; i < lists.length; i++)
    {
      for (var j = 0; j < lists[i].length; j++)
      {
        for (var k = 0; k < lists[i][j].postings.length; k++)
        {
          if (lists[i][j].postings[k].account == account)
          {
              index.push({list:i, ind: j, post: k, duplicate: -1, duplicateflag: false});
          }
        }
      }
    }
    index.sort(function(a, b) {
        var aindex = $scope.getDayIndexForTransaction(lists[a.list][a.ind], a.post);
        var bindex = $scope.getDayIndexForTransaction(lists[b.list][b.ind], b.post);
        if ((aindex - bindex) != 0)
        {
            return aindex - bindex;
        }
        return lists[a.list][a.ind].payee.localeCompare(lists[b.list][b.ind].payee);
    });
    return index;
  };

  $scope.updateLedgerSet = function() {
    $rootScope.enableOverlay();
    $http.post($rootScope.apihost+"/", {"query": "getfile", "filename": "/online.ledger", "creds": $rootScope.creds})
      .success(function(data) {
        $rootScope.disableOverlay();
        if (data.error)
        {
          if (data.error != "Missing Auth Header")
          {
            alert("Failed to load ledger file: " + data.error);
          }
        }
        else
        {
          data = data["contents"];
          var mainLedger = ledger2objects(data, false);
          $rootScope.enableOverlay();
          $http.post($rootScope.apihost+"/", {"query": "getfile", "filename": "/onlineimport.ledger", "creds": $rootScope.creds})
            .success(function(data) {
              $rootScope.disableOverlay();
              if (data.error)
              {
                if (data.error != "Missing Auth Header")
                {
                  alert("Failed to load ledger file: " + data.error);
                }
              }
              else
              {
                data = data["contents"];
                var importLedger = ledger2objects(data, false);
                $scope.ledgerSet = [mainLedger, importLedger];

                // Train classifier
                $scope.classifier = new Naivebayes();
                for (var i = 0; i < mainLedger.length; i++)
                {
                    if (mainLedger[i].postings.length == 2)
                    {
                        var posting1match = mainLedger[i].postings[0].account.indexOf('Assets:')==0 || mainLedger[i].postings[0].account.indexOf('Liabilities:')==0; 
                        var posting2match = mainLedger[i].postings[1].account.indexOf('Assets:')==0 || mainLedger[i].postings[1].account.indexOf('Liabilities:')==0;
                        // Exclusive OR
                        if ((posting1match || posting2match) && !(posting1match && posting2match))
                        {
                            var acctPosting = 0;
                            var categoryPosting = 1;
                            if (posting2match)
                            {
                                acctPosting = 1;
                                categoryPosting = 0;
                            }
                            var lookup = $scope.classifyTransformPayee(mainLedger[i].payee, mainLedger[i].postings[acctPosting]['amount']);
                            $scope.classifier.learn(lookup, mainLedger[i].postings[categoryPosting]['account']);
                            if ($scope.totalMatch[lookup] == undefined)
                            {
                                $scope.totalMatch[lookup] = [];
                            }
                            $scope.totalMatch[lookup].push(mainLedger[i].postings[categoryPosting]['account']);
                            if ($scope.totalMatch[lookup + "____" + mainLedger[i].postings[acctPosting]['account']] == undefined)
                            {
                                $scope.totalMatch[lookup + "____" + mainLedger[i].postings[acctPosting]['account']] = [];
                            }
                            $scope.totalMatch[lookup + "____" + mainLedger[i].postings[acctPosting]['account']].push(mainLedger[i].postings[categoryPosting]['account']);
                        }
                    }
                }
              }
          }).error(function (data) {
            $rootScope.disableOverlay();
          });
        }
    }).error(function(data) {
      $rootScope.disableOverlay();
    });
  }

  // Get reference to current ledgers
  $scope.updateLedgerSet();

  $scope.matchTransaction = function(item, level, ni, ei) {
    if ($scope.ledgerSet[item.eTxnIndex[ei].list][item.eTxnIndex[ei].ind].postings.length <= 1)
    {
        return false;
    }
    if (level == 0)
    {
      if ($scope.ledgerSet[item.eTxnIndex[ei].list][item.eTxnIndex[ei].ind].code
                               && item.transactions[item.nTxnIndex[ni].ind].code
       && $scope.ledgerSet[item.eTxnIndex[ei].list][item.eTxnIndex[ei].ind].code 
                               == item.transactions[item.nTxnIndex[ni].ind].code)
      {
        return true;
      }
      var testForId = function(val) {
          if(val.startsWith("id:"))
          {
              return true;
          }
          else
          {
              return false;
          }
      };
      if ($scope.ledgerSet[item.eTxnIndex[ei].list][item.eTxnIndex[ei].ind].postings[item.eTxnIndex[ei].post].blockcomments
                               && item.transactions[item.nTxnIndex[ni].ind].postings[item.nTxnIndex[ni].post].blockcomments)
      {
        var existingId = $scope.ledgerSet[item.eTxnIndex[ei].list][item.eTxnIndex[ei].ind].postings[item.eTxnIndex[ei].post].blockcomments.filter(testForId);
        var newId = item.transactions[item.nTxnIndex[ni].ind].postings[item.nTxnIndex[ni].post].blockcomments.filter(testForId);
        if (existingId.length > 0 && newId.length > 0 && existingId[0] == newId[0])
        {
            return true;
        }
      }
      return false;
    }
    else if (level == 1)
    {
      if ($scope.ledgerSet[item.eTxnIndex[ei].list][item.eTxnIndex[ei].ind].postings[item.eTxnIndex[ei].post].amount && item.transactions[item.nTxnIndex[ni].ind].postings[item.nTxnIndex[ni].post].amount)
      {
        var existingAmount = $scope.ledgerSet[item.eTxnIndex[ei].list][item.eTxnIndex[ei].ind].postings[item.eTxnIndex[ei].post].amount.replace(/[^\d.-]/g, '');
        var newAmount = item.transactions[item.nTxnIndex[ni].ind].postings[item.nTxnIndex[ni].post].amount.replace(/[^\d.-]/g, '');
        if (existingAmount == newAmount)
        {
          return true;
        }
      }
      return false;
    }
  }

  $scope.matchTransactions = function(item, level, dayTolerance, strictCheck, iterationNumber) {
    if (item.eTxnIndex.length <= 0)
    {
        return;
    }
    for (var i = 0; i < item.nTxnIndex.length; i++)
    {
      var nDayIndex = $scope.getDayIndexForTransaction(item.transactions[item.nTxnIndex[i].ind], 0);
      var searchBegin = nDayIndex-dayTolerance-item.eFirstDay;
      if (searchBegin < 0) { searchBegin = 0; }
      if (searchBegin > item.eDayIndexList.length - 1) { searchBegin = item.eDayIndexList.length - 1; }
      var searchEnd = nDayIndex+dayTolerance+1-item.eFirstDay;
      if (searchEnd < 0) { searchEnd = 0; }
      if (searchEnd > item.eDayIndexList.length - 1) { searchEnd = item.eDayIndexList.length - 1; }

      for (var ei = item.eDayIndexList[searchBegin]; ei < item.eDayIndexList[searchEnd]; ei++)
      {
        var eDayIndex = $scope.getDayIndexForTransaction($scope.ledgerSet[item.eTxnIndex[ei].list][item.eTxnIndex[ei].ind], item.eTxnIndex[ei].post);
        var thisDayTol = Math.abs(nDayIndex - eDayIndex);
        // Make sure we haven't matched this transaction, the date is correct enough
        if (!item.eTxnIndex[ei].matched && thisDayTol <= dayTolerance)
        {
          // strictCheck:
          // If this is a newer transaction than the newest existing transaction, we don't want to mark it as a 
          //  duplicate of a transaction that is older than the oldest transaction from the new transaction list
          if (!strictCheck || !(item.eTxnIndex.length > 0 && $scope.getDayIndexForTransaction(item.transactions[item.nTxnIndex[i].ind], 0) >= $scope.getDayIndexForTransaction($scope.ledgerSet[item.eTxnIndex[item.eTxnIndex.length-1].list][item.eTxnIndex[item.eTxnIndex.length-1].ind], -1) && $scope.getDayIndexForTransaction($scope.ledgerSet[item.eTxnIndex[ei].list][item.eTxnIndex[ei].ind], item.eTxnIndex[ei].post) < $scope.getDayIndexForTransaction(item.transactions[item.nTxnIndex[0].ind], 0)))
          {
            var match = $scope.matchTransaction(item, level, i, ei);
            if (match)
            {
              item.eTxnIndex[ei].matched = true;
              item.nTxnIndex[i].duplicate = ei;
              item.nTxnIndex[i].duplicateflag = true;
              item.nTxnIndex[i].matchLevel = level;
              item.nTxnIndex[i].iterationNumber = iterationNumber;
              break;
            }
          }
        }
      }
    }
  }

  $scope.filterPossibleConflictingAssertions = function (txns, newTxns) {
    var acctEarliestTxn = {};
    for (var i = 0; i < newTxns.length; i++)
    {
        for (var j = 0; j < newTxns[i].postings.length; j++)
        {
            var dayIndex = $scope.getDayIndexForTransaction(newTxns[i], j);
            if (acctEarliestTxn[newTxns[i].postings[j].account])
            {
                if (acctEarliestTxn[newTxns[i].postings[j].account] > dayIndex)
                {
                    acctEarliestTxn[newTxns[i].postings[j].account] = dayIndex;
                }
            }
            else
            {
                acctEarliestTxn[newTxns[i].postings[j].account] = dayIndex;
            }
        }
    }
    var assertionsToFilter = {};
    var assertionList = [];
    for (var i = 0; i < txns.length; i++)
    {
        // If this is an assertion posting
        if (txns[i].postings.length == 1 && txns[i].postings[0].amount.indexOf('=') >= 0)
        {
            var dayIndex = $scope.getDayIndexForTransaction(txns[i], 0);
            if (acctEarliestTxn[txns[i].postings[0].account] && acctEarliestTxn[txns[i].postings[0].account] <= dayIndex)
            {
                if (assertionsToFilter[txns[i].postings[0].account])
                {
                    // If we are filtering more than one per account, it seems fishy. Stop messing with things and return.
                    console.log("Needed to filter more than one previously added assertion for a particular account: "+txns[i].postings[0].account+". This seems wrong, let's not filter anything to avoid deleting data.");
                    return txns;
                }
                assertionsToFilter[txns[i].postings[0].account] = i;
                assertionList.push(i);
            }
        }
    }
    // Remove the specified assertions
    for (var i = 0; i < assertionList.length; i++)
    {
        // Subtract "i" because the list will be shorter after each removal
        txns.splice(assertionList[i]-i, 1);
    }
    return txns;
  }

  $scope.updateTransactions = function(item) {
    item.nTxnIndex = $scope.generateIndex([item.transactions], item.name); 
    item.eTxnIndex = $scope.generateIndex($scope.ledgerSet, item.name);

    item.eFirstDay = 0;
    item.eDayIndexList = [];
    if (item.eTxnIndex.length > 0)
    {
        // This index generation strongly depends on eTxnIndex being a range of sorted day indexes
        item.eFirstDay = $scope.getDayIndexForTransaction($scope.ledgerSet[item.eTxnIndex[0].list][item.eTxnIndex[0].ind], item.eTxnIndex[0].post);
        var lastOne = -1;
        for (var i = 0; i < item.eTxnIndex.length; i++)
        {
            var thisIdx = $scope.getDayIndexForTransaction($scope.ledgerSet[item.eTxnIndex[i].list][item.eTxnIndex[i].ind], item.eTxnIndex[i].post);
            if (thisIdx == lastOne)
            {
                continue;
            }
            lastOne = thisIdx;
            while (item.eDayIndexList.length < thisIdx - item.eFirstDay)
            {
                item.eDayIndexList.push(i);
            }
            item.eDayIndexList.push(i);
        }
        item.eDayIndexList.push(item.eTxnIndex.length);
    }

    // Running match level 1 matches amounts only matching exact days
    $scope.matchTransactions(item, 1, 0, false, 1);
    // Running match level 1 matches amounts matching 2 week buffer but use strict checking
    $scope.matchTransactions(item, 1, 7, true, 2);
    // Running match level 0 matches things such as IDs and check numbers
    $scope.matchTransactions(item, 0, 90, false, 0);

    //console.log(item.nTxnIndex);
    var tempTxns = angular.copy($scope.ledgerSet[0]);
    tempTxns = tempTxns.concat(angular.copy($scope.ledgerSet[1]));
    var newTxns = $scope.getPendingImportedTransactions(item.name);
    tempTxns = $scope.filterPossibleConflictingAssertions(tempTxns, newTxns);
    tempTxns = tempTxns.concat(newTxns);
    if ($scope.newlyAddedAccounts[item.name])
    {
        var initialbal = {};
        dateobj = new Date();
        initialbal.date = dateobj.getFullYear() + "/" + pad(dateobj.getMonth()+1, 2) + "/" + pad(dateobj.getDate(), 2)
        for (var i = 0; i < newTxns.length; i++)
        {
            if (new Date(newTxns[i].date) < new Date(initialbal.date))
            {
                initialbal.date = newTxns[i].date;
                $scope.newlyAddedAccounts[item.name].balance_date = new Date(newTxns[i].date);
            }
        }
        initialbal.payee = "Initial Balance";
        initialbal.status = "*";
        initialbal.postings = [{account: item.name, amount: $scope.newlyAddedAccounts[item.name].initialbalance}, {account: "Equity:Initial"}];
        tempTxns.unshift(initialbal);
    }
    var newLedger = objects2ledger(tempTxns);
    item.loading = true;
    $http.post($rootScope.apihost+"/", {"query": "validate", "contents": newLedger, "assertions": true, "creds": $rootScope.creds})
    .success(function(validation) {
      item.loading = false;
      if (validation.error && validation.error.indexOf("balance assertion error") <= 0)
      {
        if(confirm("New version of ledger with imported transactions did not validate due to the following error(s).  Are you sure you want to import this file? " + validation.error))
        {
            item.status = "error";
        }
        else
        {
            item.status = null;
            item.nTxnIndex = null;
            item.eTxnIndex = null;
            item.transactions = null;
            item.ofxaccount = null;
        }
      }
      else
      {
          if (validation.error)
          {
            item.status = "success_no_balance";
          }
          else
          {
            item.status = "success";
          }
      }
    }).error(function(data) {
      item.loading = false;
    });
  }

  $scope.processOfx = function(item) {
    if (item.ofxaccount)
    {
      var transactions = [];
      for (var i = 0; i < item.ofxaccount.statement.transactions.length; i++)
      {
        var txn = {};
        var posting1 = {};
        var posting2 = {};
        txn.date = item.ofxaccount.statement.transactions[i].date;
        txn.dayIndex = getDayIndex(item.ofxaccount.statement.transactions[i].date);
        posting1.account = item.name;
        posting1.blockcomments = ["date:"+txn.date];
        posting1.dayIndex = txn.dayIndex;
        posting1.amount = item.ofxaccount.statement.transactions[i].amount.replace('-', '');
        posting2.amount = item.ofxaccount.statement.transactions[i].amount.replace('-', '');
        if (item.ofxaccount.statement.currency.toLowerCase() == "usd")
        {
          posting1.amount = changeToAmericanCurrency(posting1.amount);
          posting2.amount = changeToAmericanCurrency(posting2.amount);
        }
        if (item.ofxaccount.statement.transactions[i].amount.indexOf('-') >= 0)
        {
          posting1.amount = invertAmount(posting1.amount);
        }
        else
        {
          posting2.amount = invertAmount(posting2.amount);
        }
        txn.payee = item.ofxaccount.statement.transactions[i].payee ? item.ofxaccount.statement.transactions[i].payee : (item.ofxaccount.statement.transactions[i].memo ? item.ofxaccount.statement.transactions[i].memo : "Unknown");
        txn.status = "*";
        if (item.ofxaccount.statement.transactions[i].checknum)
        {
          txn.code = item.ofxaccount.statement.transactions[i].checknum;
        }
        if (item.ofxaccount.statement.transactions[i].memo && txn.payee != item.ofxaccount.statement.transactions[i].memo)
        {
          txn.comment = item.ofxaccount.statement.transactions[i].memo;
        }
        var txnid = item.ofxaccount.statement.transactions[i].id;
        if (item.ofxaccount.account_id)
        {
          txnid = txnid.replace(item.ofxaccount.account_id, "");
        }
        if (item.ofxaccount.routing_number)
        {
          txnid = txnid.replace(item.ofxaccount.routing_number, "");
        }
        posting1.blockcomments.push("id:"+nacl.util.encodeBase64(nacl.util.decodeUTF8(txnid)));
        // Categorize
        var lookup = $scope.classifyTransformPayee(txn.payee, posting1.amount);
        if ($scope.totalMatch[lookup + "____" + posting1.account] != undefined && $scope.totalMatch[lookup].length == 1)
        {
            posting2.account = $scope.totalMatch[lookup + "____" + posting1.account][0];
        }
        else if ($scope.totalMatch[lookup] != undefined && $scope.totalMatch[lookup].length == 1)
        {
            posting2.account = $scope.totalMatch[lookup][0];
        }
        else
        {
            posting2.account = $scope.classifier.categorize(lookup);
            if (!posting2.account)
            {
                if (posting2.amount.indexOf('-') >= 0)
                {
                    posting2.account = "Income:Misc";
                }
                else
                {
                    posting2.account = "Expenses:Misc";
                }
            }
        }
        txn.postings=[posting1, posting2];
        transactions.push(txn);
      }
      item.transactions = transactions;
      $scope.updateTransactions(item);
    }
  }

  $scope.changeImport = function(item, contents_list) {
    if ((item.importType == "ofxFile" || item.importType == "ofxConnect") && contents_list.length > 0)
    {
      item.loading = true;
      item.loaded = 0;
      for (var i = 0; i < contents_list.length; i++)
      {
        $http.post($rootScope.apihost+"/", {"query": "parseofx", "contents": contents_list[i], "creds": $rootScope.creds})
            .success(function(data) {
                item.loaded++;
                var notfound = [];
                for (var k = 0; k < data.ofxaccounts.length; k++)
                {
                    var found = false;
                    for (var j = 0; j < $scope.accounts.length; j++)
                    {
                        if ($scope.accounts[j].importType == "ofxFile" && $scope.accounts[j].endofacct && data.ofxaccounts[k].account_id.endsWith($scope.accounts[j].endofacct))
                        {
                            $scope.accounts[j].ofxaccount = data.ofxaccounts[k];
                            $scope.processOfx($scope.accounts[j]);
                            found = true;
                            break;
                        }
                    }
                    if (!found)
                    {
                        if (data.ofxaccounts.length == 1)
                        {
                            if (item.endofacct && !data.ofxaccounts[k].account_id.endsWith(item.endofacct))
                            {
                                alert("Cannot find account matching account number "+data.ofxaccounts[k].account_id+" (from imported file) and another account number already defined for this account entry");
                            }
                            else
                            {
                                // Set end of acct to last 5 of this account number
                                item.endofacct = data.ofxaccounts[k].account_id.slice(-5);
                                item.ofxaccount = data.ofxaccounts[k];
                                $scope.processOfx(item);
                            }
                        }
                        else
                        {
                            notfound.push(data.ofxaccounts[k].account_id.slice(-5));
                        }
                    }
                }
                if (notfound.length > 0)
                {
                    alert("Could not find accounts with the following last 5 digits of account numbers. Please specify these account(s): "+notfound.join(", "));
                }
                
                if (item.loaded == contents_list.length)
                {
                   item.loading = false;
                }
        }).error(function(data) {
          item.loading = false;
        });
      }
    }
    else
    {
        if (item.ofxInfo)
        {
            delete item.ofxInfo;
        }
        if (item.ofxInfoDescription)
        {
            delete item.ofxInfoDescription;
        }
    }
  };

  $scope.loadAllFiles = function(ev, item, idx, arr) {
    var reader = new FileReader();  
    reader.onload = function(evt) {
      arr.push(evt.target.result);
      if (ev.target.files.length > idx + 1)
      {
        $scope.loadAllFiles(ev, item, idx + 1, arr);
      }
      else
      {
        $scope.changeImport(item, arr);
        $scope.$apply();
      }
    };
    reader.readAsText(ev.target.files[idx]);
  };

  $scope.changeImportFile = function(ev) {
    var thisElementId = ev.target.getAttribute('id');
    for (var i = 0; i < $scope.accounts.length; i++)
    {
        if ($scope.accounts[i].domid == thisElementId)
        {
          $scope.array_to_fill = [];
          $scope.loadAllFiles(ev, $scope.accounts[i], 0, $scope.array_to_fill);
          break;
        }
    }
  };

  $scope.getPendingImportedTransactions = function(acct) {
    var txns = [];
    for (var i = 0; i < $scope.accounts.length; i++)
    {
        if ($scope.accounts[i].nTxnIndex && (acct == -1 || acct == $scope.accounts[i].name))
        {
            var numTxns = 0;
            for (var j = 0; j < $scope.accounts[i].nTxnIndex.length; j++)
            {
                if (!$scope.accounts[i].nTxnIndex[j].duplicateflag)
                {
                    txns.push(angular.copy($scope.accounts[i].transactions[$scope.accounts[i].nTxnIndex[j].ind]));
                    numTxns++;
                }
            }
            if (numTxns > 0 && $scope.accounts[i].ofxaccount && $scope.accounts[i].ofxaccount.statement.balance && $scope.accounts[i].ofxaccount.statement.balance_date && $scope.accounts[i].status != "success_no_balance")
            {
                var balassert = {};
                balassert.date = $scope.accounts[i].ofxaccount.statement.balance_date;
                balassert.payee = "Balance Assertion";
                balassert.status = "*";
                var leftAmount = "0.00";
                var amount = invertAmount(invertAmount($scope.accounts[i].ofxaccount.statement.balance));
                if ($scope.accounts[i].ofxaccount.statement.currency.toLowerCase() == "usd")
                {
                    leftAmount = changeToAmericanCurrency(leftAmount);
                    amount = changeToAmericanCurrency(amount);
                }
                balassert.postings = [{account: $scope.accounts[i].name, amount: leftAmount+" = "+amount}];
                txns.push(balassert);
            }
        }
    }
    return txns;
  }

  $scope.finishImport = function ()
  {
    var anyFailures = false;
    var anyLoading = false;
    for (var i = 0; i < $scope.accounts.length; i++)
    {
        if (typeof $scope.accounts[i].nTxnIndex == "object" && $scope.accounts[i].nTxnIndex !== null && $scope.accounts[i].status == 'failure')
        {
            anyFailures = true;
        }
        if ($scope.accounts[i].loading)
        {
            anyLoading = true;
        }
    }
    if (anyLoading)
    {
        alert("There is still data loading.  Please wait until all data has loaded.");
        return;
    }
    if (!anyFailures || confirm("Some account(s) may not have imported transactions without errors. Are you sure you want to finish the import process?"))
    {
        $http.post($rootScope.apihost+"/", {"query": "getfile", "filename": "/online.ledger", "creds": $rootScope.creds})
        .success(function(ledgerdata) {
            $http.post($rootScope.apihost+"/", {"query": "getfile", "filename": "/onlineimport.ledger", "creds": $rootScope.creds})
            .success(function(importdata) {
                var tempTxns = ledger2objects(importdata["contents"], false);
                var mainTxns = ledger2objects(ledgerdata["contents"], false);
                var newTxns = $scope.getPendingImportedTransactions(-1);
                tempTxns = $scope.filterPossibleConflictingAssertions(tempTxns, newTxns);
                mainTxns = $scope.filterPossibleConflictingAssertions(mainTxns, newTxns);
                tempTxns = tempTxns.concat(newTxns);
                var newImportedLedger = objects2ledger(tempTxns);
                var newMainLedger = objects2ledger(mainTxns);
                $rootScope.enableOverlay();
                $http.post($rootScope.apihost+"/", {"query": "savefile", "filename": "/onlineimport.ledger", "contents": newImportedLedger, "creds": $rootScope.creds})
                .success(function(data) {
                    $http.post($rootScope.apihost+"/", {"query": "savefile", "filename": "/online.ledger", "contents": newMainLedger, "creds": $rootScope.creds})
                    .success(function(data) {
                        $rootScope.disableOverlay();
                        if (data.error)
                        {
                            alert("Failed to save imported ledger data: " + data.error);
                        }
                        else
                        {
                            for (var i = 0; i < $scope.accounts.length; i++)
                            {
                                $scope.accounts[i].status = null;
                                $scope.accounts[i].nTxnIndex = null;
                                $scope.accounts[i].eTxnIndex = null;
                                $scope.accounts[i].transactions = null;
                                $scope.accounts[i].ofxaccount = null;
                            }
                        }
                    })
                    .error(function(data) {
                      $rootScope.disableOverlay();
                      alert("Failed to save main ledger data");
                    });
                })
                .error(function(data) {
                  $rootScope.disableOverlay();
                  alert("Failed to save imported ledger data");
                });
            })
            .error(function(data) {
              $rootScope.disableOverlay();
              alert("Failed to load imported ledger data");
            });
        })
        .error(function(data) {
            $rootScope.disableOverlay();
            alert("Failed to load main ledger data");
        });
    }
  }

  $scope.searchOfx = function (item)
  {
    $rootScope.enableOverlay();
    $http.post($rootScope.apihost+"/", {"query": "searchofxhome", "search": item.ofxSearch})
      .success(function(data) {
        $rootScope.disableOverlay();
        if (data.error)
        {
          alert("Failed to search for bank: " + data.error);
        }
        else
        {
          if (data.result)
          {
            item.bankList = data.result;
            item.bankSelection = data.result[0].id;
          }
          else
          {
            alert("Could not find bank with that name.  Try another search.");
          }
        }
      })
      .error(function(data) {
        $rootScope.disableOverlay();
        alert("Failed to search for bank");
      });
  }

  $scope.getOfxAccounts = function (item)
  {
    $rootScope.enableOverlay();
    $http.post($rootScope.apihost+"/", {"query": "getofxaccounts", "ofxhomeid": item.bankSelection, "username": item.ofxUsername, "password": item.ofxPassword, "ofx_version": item.ofxVersion})
      .success(function(data) {
        $rootScope.disableOverlay();
        if (data.error)
        {
          alert("Failed to get list of accounts: " + data.error);
        }
        else
        {
          if (data.result)
          {
            item.accountList = data.result;
            item.bankAccountSelection = data.result[0].local_id;
          }
          else
          {
            alert("Could not find any accounts.");
          }
        }
      })
      .error(function(data) {
        $rootScope.disableOverlay();
        alert("Failed to get list of accounts.");
      });
  }

  $scope.saveOfxConnect = function (item)
  {
    for (var i = 0; i < item.accountList.length; i++)
    {
        if (item.accountList[i].local_id == item.bankAccountSelection)
        {
            item.ofxInfo = item.accountList[i];
            item.ofxInfoDescription = item.accountList[i].institution.description+" - "+item.accountList[i].description;
            item.bankList = null;
            return;
        }
    }
    alert("Unable to find selected ofx account.");
  }

  $scope.downloadOfx = function (item)
  {
    item.loading = true;
    $http.post($rootScope.apihost+"/", {"query": "downloadofx", "ofxconfig": item.ofxInfo})
      .success(function(data) {
        item.loading = false;
        if (data.error)
        {
          alert("Failed to download transactions: " + data.error);
        }
        else
        {
          if (data.contents)
          {
            $scope.changeImport(item, [data.contents]);
          }
          else
          {
            alert("Could not download transactions.");
          }
        }
      })
      .error(function(data) {
        item.loading = false;
        alert("Failed to get list of accounts.");
      });
  }

  $scope.cancel = function () {
    $uibModalInstance.dismiss('cancel');
  };

  $scope.$on('modal.closing', function(event, reason, closed) {
  });

});
