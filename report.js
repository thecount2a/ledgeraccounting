// Reporting interface controller
app.controller('reportsCtrl', ['$scope', '$rootScope', '$state', '$http', 'uiGridConstants', function ($scope, $rootScope, $state, $http, uiGridConstants) {
  $scope.gridOptions = { enableGridMenu: true, exporterMenuExcel: false, exporterPdfPageSize: 'LETTER', exporterPdfDefaultStyle: {fontSize: 8}, exporterPdfMaxGridWidth: 670  };
  $scope.gridOptions.exporterSuppressColumns = [ 'Allocate', 'Allocate Amount',  'All' ];
  $scope.rootScope = $rootScope;

  $scope.$on("$stateChangeSuccess", function(event, toState, toParams, fromState, fromParams) {
    var newReport = toParams.report ? toParams.report : "balance";
    var newTime = toParams.time ? toParams.time : (toState.name == "main.budget" ? "thismonth" : "alltime");
    var newTimePeriod = toParams.timeperiod ? toParams.timeperiod : (toState.name == "main.budget" ? "monthly" : "nogrouping");
    var newBudgetPeriod = toParams.budgetperiod ? toParams.budgetperiod : "monthly";
    var newAccounts = toParams.accounts ? toParams.accounts : "assetsliabilities_";
    var newHistorical = toParams.historical ? toParams.historical : "auto";
    if (newReport && newReport.indexOf("register") >=0 && ((!fromParams.timeperiod && !toParams.timeperiod) || (fromParams.report && fromParams.report.indexOf("register") < 0)))
    {
        newTimePeriod = "nogrouping";
    }
    $scope.selectedreport = newReport;

    $scope.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (newTime && newTime[0] == "{")
    {
        var timeStruct = JSON.parse(newTime);
        $scope.selectedtime = timeStruct.time;
        if (timeStruct.startdate)
        {
            $scope.startdate = new Date(timeStruct.startdate);
        }
        else
        {
            $scope.startdate = null;
        }
        if (timeStruct.enddate)
        {
            $scope.enddate = new Date(timeStruct.enddate);
        }
        else
        {
            $scope.enddate = null;
        }
    }
    else
    {
        $scope.selectedtime = newTime;
        $scope.startdate = null;
        $scope.enddate = null;
    }
    $scope.selectedtimeperiod = newTimePeriod;
    $scope.selectedbudgetperiod = newBudgetPeriod;
    $scope.selectedaccounts = newAccounts;
    $scope.selectedhistorical = newHistorical;
    $scope.loadReport(toState.name);
  });
  $scope.changeReport = function(reportName) {
    $state.go('.', {report: reportName});
  }
  $scope.changeTime = function(reportTime) {
    var timeStruct = reportTime;
    var start = moment($scope.startdate);
    var end = moment($scope.enddate);
    if (start.isValid() || end.isValid())
    {
        timeStruct = JSON.stringify({time: reportTime, startdate: start.isValid() ? start.format("YYYY/MM/DD") : "", enddate: end.isValid() ? end.format("YYYY/MM/DD") : ""});
    }
    $state.go('.', {time: timeStruct});
  }
  $scope.changeTimePeriod = function(reportTimePeriod) {
    $state.go('.', {timeperiod: reportTimePeriod});
  }
  $scope.changeBudgetPeriod = function(reportBudgetPeriod) {
    $state.go('.', {budgetperiod: reportBudgetPeriod});
  }
  $scope.changeAccounts = function(reportAccounts) {
    $state.go('.', {accounts: reportAccounts});
  }
  $scope.changeHistorical = function(historical) {
    $state.go('.', {historical: historical});
  }
  $scope.accountnames = [];
  // Load account names
  $rootScope.enableOverlay();
  $http.post($rootScope.apihost+"/", {"query": "report", "name": "accounts", "creds": $rootScope.creds})
      .success(function(data) {
            $rootScope.disableOverlay();
            $scope.accountnames = data.result;
            if ($scope.accountnames)
            {
              $scope.accountnames.sort(function(a, b){
                return a.localeCompare(b);
              });
            }
  }).error(function(data) {
     $rootScope.disableOverlay();
  });
  $scope.gridOptions.onRegisterApi = function(gridApi) {
    //set gridApi on scope
    $scope.gridApi = gridApi;
    if (gridApi.selection)
    {
        gridApi.selection.on.rowSelectionChanged($scope,function(row){
            if (!row.isSelected)
            {
                row.entity['Allocate Amount'] = '';
                row.entity['Allocate'] = '';
            }
            else
            {
                row.entity['Allocate'] = 'To';
            }
        });
 
        gridApi.selection.on.rowSelectionChangedBatch($scope,function(rows){
        });
    }
    if (gridApi.edit)
    {
        gridApi.edit.on.afterCellEdit($scope,function(rowEntity, colDef, newValue, oldValue){
            if (newValue)
            {
                if (rowEntity.account != "Total")
                {
                    // Budget report allocation
                    var rows = $scope.gridApi.selection.getSelectedRows();
                    var found = false;
                    for (var i = 0; i < rows.length; i++)
                    {
                        if (rowEntity == rows[i])
                        {
                            found = true;
                        }
                    }
                    if (!found)
                    {
                        $scope.gridApi.selection.selectRow(rowEntity);
                    }
                    var changeTo = changeToAmericanCurrency(newValue);
                    if (changeTo.indexOf('-') >= 0)
                    {
                        changeTo = changeTo.replace('-', '');
                        rowEntity['Allocate'] = 'From';
                    }
                    else if (!rowEntity['Allocate'])
                    {
                        rowEntity['Allocate'] = 'To';
                    }
                    if (newValue != changeTo)
                    {
                        rowEntity[colDef.name] = changeTo;
                    }
                }
                else
                {
                    rowEntity[colDef.name] = "";
                }
            }
        });
     }
  };
  $scope.savedbudgets = [];
  $scope.budgetState = 'report';
  $scope.savedColumns = null;
  $scope.fillAll = function(row) {
    row['Allocate Amount'] = invertAmount(row[$scope.gridOptions.columnDefs[$scope.gridOptions.columnDefs.length-4].name]);
    if (row['Allocate Amount'] && row['Allocate Amount'].indexOf('-') >= 0)
    {
        row['Allocate Amount'] = row['Allocate Amount'].replace('-', '');
        row['Allocate'] = 'From';
    }
    else
    {
        row['Allocate'] = 'To';
    }
    $scope.gridApi.selection.selectRow(row);
  }
  $scope.startAllocate = function() {
    $scope.budgetState = 'allocating';
    $scope.gridOptions.enableCellEditOnFocus = true;
    $scope.gridOptions.columnDefs.push({name: "Allocate Amount", cellClass: "custom-right-align", enableCellEdit: true, width: "165", enableSorting: false});
    $scope.gridOptions.columnDefs.push({name: "All", allowCellFocus: false, enableCellEdit: false, width: "45", cellTemplate: "<div><button ng-if=\"row.entity.account != 'Total'\" class='btn mybtn' ng-click='grid.appScope.fillAll(row.entity);$event.stopPropagation();'>All</button></div>", enableSorting: false});
  }
  $scope.transactiondate = new Date;
  $scope.finishAllocate = function() {
    var rows = $scope.gridApi.selection.getSelectedRows();
    if (rows.length > 0)
    {
        var txn = {};
        var tdate = $scope.transactiondate;
        txn.date = tdate.getFullYear() + "/" + pad(tdate.getMonth()+1, 2) + "/" + pad(tdate.getDate(), 2);
        txn.payee = "Allocate Budget";
        txn.postings = []
        for (var i = 0; i < rows.length; i++)
        {
            if (rows[i]['account'] != 'Total')
            {
                var posting = {};
                if (rows[i]['Allocate Amount'])
                {
                    posting.account = rows[i]['account'];
                    posting.amount = rows[i]['Allocate'] == 'From' ? invertAmount(rows[i]['Allocate Amount']) : rows[i]['Allocate Amount'];
                }
                else
                {
                    posting.account = rows[i]['account'];
                }
                txn.postings.push(posting);
            }
        }
        $rootScope.enableOverlay();
        $http.post($rootScope.apihost+"/", {"query": "validate", "contents": objects2ledger([txn], false), "creds": $rootScope.creds})
        .success(function(validation) {
          $rootScope.disableOverlay();
          if (validation.error)
          {
            alert("Cannot commit budget reallocation due to the following errors: " + validation.error);
          }
          else
          {
            $rootScope.enableOverlay();
            $http.post($rootScope.apihost+"/", {"query": "getfile", "filename": "/onlinebudget.ledger", "creds": $rootScope.creds})
            .success(function(data) {
              $rootScope.disableOverlay();
              if (data.error)
              {
                alert("Failed to get budget: " +data.error);
              }
              else
              {
                data = data["contents"];
                var objs = ledger2objects(data, true);
                var objsNoInvert = ledger2objects(data, false);
                var testTranslation = objects2ledger(objsNoInvert, false).replace(/\s/g, "");
                if (data.replace(/\s/g, "") != testTranslation)
                {
                  if (confirm("This program is not able to read the budget ledger due to translation issues.  Please click Cancel if you really want to process the ledger anyway, regardless of possible data loss."))
                  {
                      return;
                  }
                }
                objs.push(txn);
                $rootScope.enableOverlay();
                $http.post($rootScope.apihost+"/", {"query": "savefile", "filename": "/onlinebudget.ledger", "contents": objects2ledger(objs, true), "creds": $rootScope.creds})
                .success(function(data) {
                  $rootScope.disableOverlay();
                  if (data.error)
                  {
                    alert("Failed to save budget: " +data.error);
                  }
                  else
                  {
                    $scope.loadReport('main.budget');
                  }
                })
                .error(function(data) {
                    $rootScope.disableOverlay();
                    alert("Failed to save updated budget");
                });
              }
            })
            .error(function(data) {
                $rootScope.disableOverlay();
                alert("Failed to get budget");
            });
          }
        })
        .error(function(data) {
            $rootScope.disableOverlay();
            alert("Failed to validate budget reallocation");
        });
        return;
    }
    $scope.cleanupAllocate();
  };
  $scope.cleanupAllocate = function() {
    for (var i = 0; i < $scope.gridOptions.data.length; i++)
    {
        if ($scope.gridOptions.data[i]['Allocate Amount'])
        {
            $scope.gridOptions.data[i]['Allocate Amount'] = '';
        }
        if ($scope.gridOptions.data[i]['Allocate'])
        {
            $scope.gridOptions.data[i]['Allocate'] = '';
        }
    }
    $scope.gridApi.selection.clearSelectedRows();
    $scope.budgetState = 'report';
    $scope.gridOptions.enableCellEditOnFocus = false;
    $scope.gridOptions.columnDefs.splice($scope.gridOptions.columnDefs.length - 2, 2);
  }

  $scope.reallocateClass = function(entity, opt)
  {
    if (entity.Allocate == opt)
    {
        return ' active';
    }
    return '';
  }

  $scope.selectAllocate = function(entity, opt)
  {
    if ($scope.budgetState != "allocating")
    {
        $scope.startAllocate();
    }
    $scope.gridApi.selection.selectRow(entity);
    entity.Allocate = opt;
    window.setTimeout(function() {document.activeElement.blur();});
  }

  $scope.loadReport = function(stateName) {
    if (!$rootScope.token)
    {
        return;
    }
    $scope.budgetState = 'report';
    var reportData = {"query": "report", "creds": $rootScope.creds};
    reportData["name"] = stateName == "main.budget" ? "budget" : $scope.selectedreport;
    reportData["timeperiod"] = $scope.selectedtimeperiod;
    reportData["historical"] = $scope.selectedhistorical;
    if (stateName == "main.budget")
    {
        reportData["budgetperiod"] = $scope.selectedbudgetperiod;
    }
    if ($scope.selectedtime == "custom")
    {
        var start = moment($scope.startdate);
        var end = moment($scope.enddate);
        if (start.isValid() && !end.isValid())
        {
            reportData["time"] = start.format("YYYY/MM/DD");
        }
        else if (start.isValid() && end.isValid())
        {
            reportData["time"] = start.format("YYYY/MM/DD")+" "+end.format("YYYY/MM/DD");
        }
    }
    else if ($scope.selectedtime != "alltime")
    {
        var timeStr = $scope.selectedtime;
        var parts = timeStr.split('_');
        if (parts[0] == "past")
        {
            var curDate = new Date();
            if (parts[2] == "days")
            {
                pastDate = new Date(new Date() - (Number(parts[1])-1) * 60*60*24*1000);
                reportData["time"] = pastDate.getFullYear() + "/" + pad(pastDate.getMonth()+1, 2) + "/" + pad(pastDate.getDate(), 2) + "-";
            }
            else if (parts[2] == "months")
            {
                pastDate = new Date(new Date() - (Number(parts[1])-1) * 31*60*60*24*1000);
                var curMonth = curDate.getMonth()+2;
                var curYear = curDate.getFullYear();
                if (curMonth > 12)
                {
                    curMonth = 1;
                    curYear++;
                }
                reportData["time"] = pastDate.getFullYear() + "/" + pad(pastDate.getMonth()+1, 2) + "-"+ curYear + "/" + pad(curMonth, 2);
            }
        }
        else
        {
           reportData["time"] = $scope.selectedtime;
        }
    }
    if ($scope.selectedaccounts != "allaccounts")
    {
        reportData["accounts"] = $scope.selectedaccounts;
    }

    $rootScope.enableOverlay();
    $http.post($rootScope.apihost+"/", reportData)
      .success(function(data) {
        $rootScope.disableOverlay();
        var result = data;
        if (typeof result.result == typeof [])
        {
            var cellTemp = '<div ng-dblclick="grid.appScope.doubleClickEvent(col, row)" class="ui-grid-cell-contents{{grid.appScope.cellFormatter(col, row)}}" title="TOOLTIP">{{COL_FIELD CUSTOM_FILTERS}}</div>';
            var defs = [];
            var seenTxnidx = false;
            for (var i = 0; i < result.headers.length; i++)
            {
                var colName = result.headers[i];
                if (colName == "txnidx")
                {
                    seenTxnidx = true;
                }
                if (colName != "short account" && colName != "indent" && colName != "txnidx")
                {
                    if (colName == "account" || colName == "date" || colName == "description")
                    {
                        if (seenTxnidx && colName == "account")
                        {
                            defs.push({name: colName, width: '15%', enableCellEdit: false, enableSorting: false, pinnedLeft: $scope.isMobile ? false : true});
                            defs.push({name: "other account", width: '15%', enableCellEdit: false, enableSorting: false, pinnedLeft: $scope.isMobile ? false : true});
                        }
                        else
                        {
                            defs.push({name: colName, width: (colName=="date" ? '140' : ($scope.isMobile ? '45%' : '30%')), enableCellEdit: false, enableSorting: false, pinnedLeft: $scope.isMobile ? false : true});
                        }
                    }
                    else if ((colName.search(/[0-9]/) >= 0) && (colName.search('Budget') == 0 || colName.search('Actual') == 0 || colName.search('Balance') == 0))
                    {
                        defs.push({name: colName, enableCellEdit: false, enableSorting: false, cellTemplate: cellTemp, width: "85"});
                    }
                    else if ((colName.search(/[0-9]/) >= 0) || colName == "amount" || colName == "total" || colName == "balance")
                    {
                        defs.push({name: colName, enableCellEdit: false, enableSorting: false, cellTemplate: cellTemp, width: "140"});
                    }
                    else
                    {
                        defs.push({name: colName, enableCellEdit: false, enableSorting: false});
                    }
                }
            }
            if (stateName == "main.budget")
            {
                defs.push({name: "Allocate", allowCellFocus: false, enableCellEdit: false, width: "185", cellTemplate: "<div><div ng-if=\"row.entity.account != 'Total'\" class=\"btn-group btn-radio\" role=\"group\" style=\"margin-left: 80px\"><button type=\"button\" style=\"margin-top: 3px;\" class=\"btn btn-default btn-xs{{grid.appScope.reallocateClass(row.entity, 'From')}}\" ng-click=\"grid.appScope.selectAllocate(row.entity, 'From');\">&nbsp;From&nbsp;</button><button type=\"button\" style=\"margin-top: 3px;\" class=\"btn btn-default btn-xs{{grid.appScope.reallocateClass(row.entity, 'To')}}\" ng-click=\"grid.appScope.selectAllocate(row.entity, 'To');\">&nbsp;&nbsp;&nbsp;To&nbsp;&nbsp;&nbsp;</button></div></div>", enableSorting: false});
            }
            for (var i = 0; i < result.result.length; i++)
            {
                var ledger = null;
                var ledgeridx = null;
                if ($scope.selectedreport == "register" && result.result[i]['account'] && result.result[i]['txnidx'] && $scope.rootScope.objects['/online.ledger'][Number(result.result[i]['txnidx'])-1])
                {
                    ledger = '/online.ledger';
                    ledgeridx = Number(result.result[i]['txnidx'])-1;
                }
                if ($scope.selectedreport == "budgetregister" && result.result[i]['account'] && result.result[i]['txnidx'] && $scope.rootScope.objects['/onlinebudget.ledger'][Number(result.result[i]['txnidx'])-1])
                {
                    ledger = '/onlinebudget.ledger';
                    ledgeridx = Number(result.result[i]['txnidx'])-1;
                }
                if ($scope.selectedreport == "combinedregister" && result.result[i]['account'] && result.result[i]['txnidx'])
                {
                    ledger = '/online.ledger';
                    ledgeridx = Number(result.result[i]['txnidx'])-1;
                    if (ledgeridx >= $scope.rootScope.objects[ledger].length)
                    {
                        ledgeridx -= $scope.rootScope.objects[ledger].length;
                        ledger = '/onlinebudget.ledger';
                    }
                    if (!$scope.rootScope.objects[ledger][ledgeridx])
                    {
                        ledger = null;
                        ledgeridx = null;
                    }
                }
                if (ledger && ledgeridx)
                {
                    var otherAccount = '';
                    for (var j = 0; j < $scope.rootScope.objects[ledger][ledgeridx].postings.length; j++)
                    {
                        var thisAcct = $scope.rootScope.objects[ledger][ledgeridx].postings[j].account;
                        if (result.result[i]['account'] != thisAcct)
                        {
                            if (!otherAccount)
                            {
                                otherAccount = thisAcct;
                            }
                            else
                            {
                                otherAccount = '--Split--';
                            }
                        }
                    } 
                    result.result[i]['other account'] = otherAccount;
                }
            }
            $scope.gridOptions.data = result.result;
            $scope.gridOptions.columnDefs = defs;
        }
        else
        {
            alert("Report failed: " + result.error);
        }
      }).error(function(data) {
        $rootScope.disableOverlay();
      });

     $scope.doubleClickEvent = function( col, row ) {
        var acctkey = "Account";
        if (row.entity.account)
        {
            acctkey = "account";
        }
        if (($scope.selectedreport == "balance" || $scope.selectedreport == "budget") && row.entity[acctkey] && row.entity[acctkey] != "total")
        {
            var reportDescr = {timeperiod: "nogrouping", accounts: "_"+row.entity[acctkey]};
            var timeStruct = {time: "custom"};
            reportDescr.report = "register";
            reportDescr.historical = "nohistorical";
            if (col.name.search('Budget') == 0)
            {
                reportDescr.report = "budgetregister";
                reportDescr.historical = "nohistorical";
            }
            else if (col.name.search('Balance') == 0)
            {
                reportDescr.report = "combinedregister";
                reportDescr.historical = "includehistorical";
            }
            else if (col.name.search('Actual') == 0)
            {
                reportDescr.report = "register";
                reportDescr.historical = "nohistorical";
            }
            var dateObj = null;
            if(col.name.search(/[0-9]/) >= 0)
            {
                var period = null;
                if (col.name.search('Budget') >= 0)
                {
                    period = $scope.selectedbudgetperiod;
                }
                else
                {
                    period = $scope.selectedtimeperiod;
                }
                var colName = col.name.replace('q1', '/01').replace('q2', '/04').replace('q3', '/07').replace('q4', '/10');
                if (period == "daily")
                {
                    var arr = colName.match(/([0-9]+\/[0-9]+\/[0-9]+)/);
                    if (arr)
                    {
                        dateObj = moment(arr[0], "YYYY/MM/DD");
                        timeStruct.startdate = dateObj.format("YYYY/MM/DD").toDate();
                        dateObj = dateObj.add(1, 'days');
                        timeStruct.enddate = dateObj.format("YYYY/MM/DD").toDate();
                    }
                    else
                    {
                        return;
                    }
                }
                else if (period == "weekly")
                {
                    var arr = colName.match(/([0-9]+\/[0-9]+\/[0-9]+)/);
                    if (arr)
                    {
                        dateObj = moment(arr[0], "YYYY/MM/DD");
                        timeStruct.startdate = dateObj.toDate();
                        dateObj = dateObj.add(7, 'days');
                        timeStruct.enddate = dateObj.toDate();
                    }
                    else
                    {
                        return;
                    }
                }
                else if (period == "monthly")
                {
                    var arr = colName.match(/([0-9]+\/[0-9]+)/);
                    if (arr)
                    {
                        dateObj = moment(arr[0] + "/01", "YYYY/MM/DD");
                        timeStruct.startdate = dateObj.toDate();
                        dateObj = dateObj.add(1, 'months');
                        timeStruct.enddate = dateObj.toDate();
                    }
                    else
                    {
                        return;
                    }
                }
                else if (period == "quarterly")
                {
                    var arr = colName.match(/([0-9]+\/[0-9]+)/);
                    if (arr)
                    {
                        dateObj = moment(arr[0] + "/01", "YYYY/MM/DD");
                        timeStruct.startdate = dateObj.toDate();
                        dateObj = dateObj.add(3, 'months');
                        timeStruct.enddate = dateObj.toDate();
                    }
                    else
                    {
                        return;
                    }
                }
                else if (period == "yearly")
                {
                    var arr = colName.match(/([0-9]+)/);
                    if (arr)
                    {
                        dateObj = moment(arr[0] + "/01/01", "YYYY/MM/DD");
                        timeStruct.startdate = dateObj.toDate();
                        dateObj = dateObj.add(1, 'years');
                        timeStruct.enddate = dateObj.toDate();
                    }
                    else
                    {
                        return;
                    }
                }
            }
            if (dateObj)
            {
                reportDescr.time = JSON.stringify(timeStruct);
            }
            else
            {
                reportDescr.time = "alltime";
            }
            $state.go('main.reports', reportDescr);
        }
     };

     $scope.cellFormatter = function( col, row ) {
        var formats = "";
        {
            formats += " custom-right-align";
            if (col.name.search('Budget') == 0)
            {
                formats += " custom-left";
            }
            if (col.name.search('Balance') == 0)
            {
                if (row.entity['account'].search('Income') == 0 && row.entity[col.name] != "0")
                {
                    formats += " custom-red";
                }
                else if(row.entity[col.name] && row.entity[col.name].indexOf('-') >= 0)
                {
                    formats += " custom-red";
                }
            }
        }
        return formats;
     }
  }
}]);
