// Ledger editor interface controller implementation
app.controller('editorCtrl', ['$scope', '$rootScope', '$http', '$uibModal', '$state', 'uiGridConstants', function ($scope, $rootScope, $http, $uibModal, $state, uiGridConstants) {
  $scope.rootScope = $rootScope;
  var statusDropdown = [{id: 1, status: ""}, {id: 2, status: "!"}, {id: 3, status: "*"}];
  $scope.gridOptions = { enableCellEditOnFocus: false, enableGridMenu: true };
  var cellTemp = '<div class="ui-grid-cell-contents{{grid.appScope.cellFormatter(col, row)}}" title="TOOLTIP">{{COL_FIELD CUSTOM_FILTERS}}</div>';
  var tcellEditable = function($scope) { return $scope.row.entity.type != "posting" ? true : false };
  var pcellEditable = function($scope) { return $scope.row.entity.type != "transaction" ? true : false };

  $scope.$on("$stateChangeSuccess", function(event, toState, toParams, fromState, fromParams) {
    var newLedger = toParams.ledger ? toParams.ledger : "/online.ledger";
    var newAccounts = toParams.accounts ? toParams.accounts : "allaccounts";
    $scope.selectedledger = newLedger;
    $scope.selectedaccounts = newAccounts;
    $scope.loadLedger(newLedger);
  });

$scope.$on('$destroy', function() {
    if ($scope.loadedLedger && objects2ledger($scope.getDataFromGrid()) != $scope.loadedLedgerData)
    {
        if (confirm("You are about to lose unsaved changes.  Do you want to save changes to your ledger?"))
        {
            $scope.saveData();
        }
    }
});

  $scope.changeLedger = function(editLedger) {
    $state.go('.', {ledger: editLedger});
  }

  $scope.changeAccounts = function(editAccounts) {
    $state.go('.', {accounts: editAccounts});
  }
  $scope.accountnames = [];

  $scope.onSelectCallback = function(item, model, entity, col) {
    if (item == "Create New Account...")
    {
      var ind = -1;
      for (i = 0; i < $scope.gridOptions.data.length; i++)
      {
          if (entity == $scope.gridOptions.data[i])
          {
              ind = i;
          }
      }
      if (ind != -1)
      {
        var modalInstance = $uibModal.open({
          animation: true,
          templateUrl: 'newaccount.html',
          controller: 'NewAccountCtrl',
          resolve: { expenseincome: true }
        });

        modalInstance.result.then(function (info) {
          globalAccounts.push(info.name);
          $scope.rootScope.globalAccounts.sort(function(a, b){
            if (a == "Create New Account...") { return -1; }
            if (b == "Create New Account...") { return 1; }
            return a.localeCompare(b);
          });
          $scope.txnHint('put', entity, col.colDef.name, info.name);
        }, function() {
          // Not ideal to set the new account on cancel but hopefully there wont be any cancel
          $scope.txnHint('put', entity, col.colDef.name, "Expenses:Misc");
        });
      }
    }
  };
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
            else
            {
             $scope.accountnames = [];
            }
  }).error(function(data) {
      $rootScope.disableOverlay();
  });

  $scope.onMagicCode = function(cb) {
    $scope.magicInput = '';
    $scope.magicKey = 'ShiftLeftShiftRightShiftLeftShiftRightShiftLeftShiftRight';
    $scope.magicFunc =  function (e) {
      $scope.magicInput += ("" + e.code);
      if ($scope.magicInput === $scope.magicKey) {
        return cb();
      }
      if (!$scope.magicKey.indexOf($scope.magicInput)) return;
      $scope.magicInput = ("" + e.code);
    } 

    document.addEventListener('keydown', $scope.magicFunc);
  }

  $scope.$on('$destroy', function() {
    document.removeEventListener('keydown', $scope.magicFunc);
    document.magicEventAttached = false;
  });

  if (document.magicEventAttached)
  {
    document.removeEventListener('keydown', $scope.magicFunc);
    document.magicEventAttached = false;
  }
  document.magicEventAttached = true;
  $scope.openScriptWindow = function() {
      var modalInstance = $uibModal.open({
        animation: true,
        windowClass: 'my-modal-window',
        templateUrl: 'promptcode.html',
        controller: 'PromptCodeCtrl'
      });

      modalInstance.result.then(function (script) {
          if (script)
          {
              var f = new Function("$scope", script);
              f($scope);
          }
      }, function() {
      });
  };
  $scope.onMagicCode(function () {
      $scope.openScriptWindow();
  });

  $scope.transformAmount = function(amt)
  {
    if (typeof amt != 'string')
    {
        return amt;
    }
    if (amt == "0" || amt == "$0" || amt == "$0.0" || amt == "$0.00" || !isAmericanCurrency(amt))
    {
        return amt;
    }
    else if (amt.replace('-', '') != amt)
    {
        //return '\u2B62 ' + amt.replace('-', '') + ' \u2B62';
        return '\u2192 ' + amt.replace('-', '') + ' \u2192';
    }
    else
    {
        //return '\u2B60 ' + amt + ' \u2B60';
        return '\u2190 ' + amt + ' \u2190';
    }
  }

  $scope.txnPositionCache = {};

  $scope.txnHint = function(op, entity, col, newValue = null)
  {
    var accts = [];
    var beginTxn = -1;
    var idxOfOtherAcct = -1;
    if (col == "account" && $scope.selectedaccounts != "allaccounts")
    {
        if (op == "getraw" || op == "get")
        {
            return $scope.selectedaccounts.substr(1);
        }
    }
    var i;
    for (i = 0; i < $scope.gridOptions.data.length; i++)
    {
        if (i == 0 && $scope.txnPositionCache[entity.$$hashKey] !== undefined)
        {
            i = $scope.txnPositionCache[entity.$$hashKey];
        }
        if (beginTxn >= 0)
        {
            if ($scope.gridOptions.data[i].type == "transaction")
            {
                break;
            }
            if ($scope.gridOptions.data[i].type == "posting")
            {
                if ($scope.selectedaccounts == "allaccounts")
                {
                    if (col == "account")
                    {
                        if (op == "getraw" || op == "get")
                        {
                            return $scope.gridOptions.data[i].account;
                        }
                        else
                        {
                            $scope.gridOptions.data[i].account = newValue;
                            return;
                        }
                    }
                    else if (col == "amount")
                    {
                        if (op == "get")
                        {
                            return $scope.transformAmount($scope.gridOptions.data[i].amount);
                        }
                        else if (op == "getraw")
                        {
                            if (typeof $scope.gridOptions.data[i].amount == "string")
                            {
                                return $scope.gridOptions.data[i].amount;
                            }
                            else
                            {
                                return "";
                            }
                        }
                        else
                        {
                            $scope.gridOptions.data[i].amount = newValue;
                            return;
                        }
                    }
                    else if (i > beginTxn +1)
                    {
                        accts.push($scope.gridOptions.data[i].account);
                        idxOfOtherAcct = i;
                    }
                }
                else if (col == "amount" && "_" + $scope.gridOptions.data[i].account == $scope.selectedaccounts)
                {
                    if (op == "get")
                    {
                        return $scope.transformAmount($scope.gridOptions.data[i].amount);
                    }
                    else if (op == "getraw")
                    {
                        if (typeof $scope.gridOptions.data[i].amount == "string")
                        {
                            return $scope.gridOptions.data[i].amount;
                        }
                        else
                        {
                            return "";
                        }
                    }
                    else if (op == "put")
                    {
                        $scope.gridOptions.data[i].amount = newValue;
                        return;
                    }
                }
                else if (col == "account" && "_" + $scope.gridOptions.data[i].account == $scope.selectedaccounts)
                {
                    if (op == "put")
                    {
                        $scope.gridOptions.data[i].account = newValue;
                    }
                }
                else if ("_" + $scope.gridOptions.data[i].account != $scope.selectedaccounts)
                {
                    accts.push($scope.gridOptions.data[i].account);
                    idxOfOtherAcct = i;
                }
            }
        }
        if (entity == $scope.gridOptions.data[i])
        {
            beginTxn = i;
        }
        $scope.txnPositionCache[$scope.gridOptions.data[i].$$hashKey] = i;
    }
    if (col == "otheraccount")
    {
        if (accts.length > 1)
        {
            if (op == "get")
            {
                return "--Split--";
            }
            else if (op == "getraw")
            {
                return null;
            }
            return null;
        }
        if (op != "put" && accts.length < 1)
        {
            if (i - beginTxn >= 2)
            {
                return "";
            }
            else
            {
                return null;
            }
        }
        if (op == "getraw" || op == "get")
        {
            return accts[0];
        }
        else if (op == "put")
        {
            if (accts.length < 1)
            {
                if (i - beginTxn >= 2)
                {
                    $scope.gridOptions.data.splice(beginTxn+2, 0, {type: "posting", account: newValue});
                    $scope.txnPositionCache = {};
                }
            }
            else
            {
                $scope.gridOptions.data[idxOfOtherAcct].account = newValue;
            }
            return;
        }
    }
    return null;
  }

  var hintCellEditable = function(scope, type) {
    if (scope.row.entity.type != "transaction")
    {
        if (type == "otheraccount")
        {
            return false;
        }
        else
        {
            return true;
        }
    }
    if (scope.row.treeNode.state != "collapsed")
    {
        return false;
    }
    var val = $scope.txnHint('getraw', scope.row.entity, type);
    if (val !== null)
    {
        if (type == "amount")
        {
            scope.row.entity.amount = val;
        }
        else if (type == "account")
        {
            scope.row.entity.account = val;
        }
        else if (type == "otheraccount")
        {
            scope.row.entity.otheraccount = val;
        }
    }
    else
    {
        return false;
    }
    return true;
  }

  $scope.gridOptions.columnDefs = [
    { name: 'date', displayName: 'Date', width: '8%', type: 'date', cellFilter: 'date:"yyyy-MM-dd"', cellTemplate: cellTemp, cellEditableCondition: tcellEditable, enableSorting: false },
    { name: 'code', displayName: 'Check #', width: '4%', cellTemplate: cellTemp, cellEditableCondition: tcellEditable, enableSorting: false },
    { name: 'payee', displayName: 'Payee', width: '26%', cellTemplate: cellTemp, cellEditableCondition: tcellEditable, enableSorting: false },
    { name: 'status', displayName: 'Status', width: '4%', cellTemplate: cellTemp, editDropdownValueLabel: 'status', editDropdownOptionsArray: statusDropdown, cellTemplate: cellTemp, editableCellTemplate: 'ui-grid/dropdownEditor', cellFilter: 'mapStatus', enableSorting: false },
    { name: 'account', displayName: 'Account', editableCellTemplate: 'uiSelect',  width: '22%',  editDropdownOptionsArray: $scope.rootScope.globalAccounts, cellTemplate: cellTemp.replace("{{COL_FIELD CUSTOM_FILTERS}}", "<span ng-if=\"row.treeNode.state=='collapsed' && row.entity.type=='transaction'\">{{grid.appScope.txnHint('get', row.entity, 'account')}}</span><span ng-if=\"row.treeNode.state!='collapsed' || row.entity.type!='transaction'\">{{COL_FIELD CUSTOM_FILTERS}}</span>"), cellEditableCondition: function(s) { return hintCellEditable(s, 'account'); }, enableSorting: false },
    { name: 'amount', displayName: 'Amount', width: '10%', cellTemplate: cellTemp.replace("{{COL_FIELD CUSTOM_FILTERS}}", "<span ng-if=\"row.treeNode.state=='collapsed' && row.entity.type=='transaction'\">{{grid.appScope.txnHint('get', row.entity, 'amount')}}</span><span ng-if=\"row.treeNode.state!='collapsed' || row.entity.type!='transaction'\">{{COL_FIELD CUSTOM_FILTERS}}</span>"), cellEditableCondition: function(s) { return hintCellEditable(s, 'amount'); }, enableSorting: false },
    { name: 'otheraccount', displayName: 'Other Account', editableCellTemplate: 'uiSelect',  width: '22%',  editDropdownOptionsArray: $scope.rootScope.globalAccounts, cellTemplate: cellTemp.replace("{{COL_FIELD CUSTOM_FILTERS}}", "<span ng-if=\"row.treeNode.state=='collapsed' && row.entity.type=='transaction'\">{{grid.appScope.txnHint('get', row.entity, 'otheraccount')}}</span><span ng-if=\"row.treeNode.state!='collapsed' || row.entity.type!='transaction'\">{{COL_FIELD CUSTOM_FILTERS}}</span>"), cellEditableCondition: function(s) { return hintCellEditable(s, 'otheraccount'); }, enableSorting: false },
    { name: 'comment', displayName: 'Memo', width: '20%', cellTemplate: cellTemp, enableSorting: false, visible: false },
  ];
 $scope.cellFormatter = function( col, row ) {
    var formats = "";
    if (col.name == "amount")
    {
        if (row.entity.type != "transaction")
        {
            formats += " custom-right-align";
        }
        else
        {
            formats += " custom-center-align";
        }
    }
    if (col.name == "account" && row.entity.type == "transaction")
    {
        formats += " custom-right-align";
    }
    if (col.name == "status")
    {
        if (row.entity.type == "posting")
        {
            formats += " custom-left";
        }
        formats += " custom-center-align";
    }
    if (col.name == "otheraccount" || col.name == "comment")
    {
        if (row.entity.type == "posting")
        {
            formats += " custom-left";
        }
    }
    if (((col.name == "status" || col.name == "account" || col.name == "amount" || col.name == "comment") && row.entity.type == "posting") || row.entity.type != "posting")
    {
        formats += " custom-bottom";
    }
    if (row.entity.status == 2)
    {
        formats += " custom-red";
    }
    else if (row.entity.status == 3)
    {
        formats += " custom-blue";
    }
    return formats;
  };

  $scope.open = function () {

    var modalInstance = $uibModal.open({
      animation: true,
      templateUrl: 'rawledgereditor.html',
      controller: 'RawLedgerEditorCtrl',
      windowClass: 'my-modal-window',
      resolve: {
        text: function () {
          var invert = $scope.selectedledger.indexOf('budget') >= 0 ? true : false;
          return objects2ledger($scope.getDataFromGrid(), invert);
        },
        creds: $rootScope.creds,
        apihost: function() {
	  return $rootScope.apihost
	}
      }
    });

    modalInstance.result.then(function (text) {
      $rootScope.enableOverlay();
      $http.post($rootScope.apihost+"/", {"query": "savefile", "filename": $scope.selectedledger, "contents": text, "creds": $rootScope.creds})
        .success(function(data) {
          $rootScope.disableOverlay();
          if (data.error)
          {
            alert("Failed to save raw ledger data: " + data.error);
          }
          else
          {
            $scope.loadLedger($scope.selectedledger);
          }
        })
        .error(function(data) {
          $rootScope.disableOverlay();
          alert("Failed to save raw ledger data");
        });
    }, function () {
    });
  };

 
 $scope.msg = {};

 $scope.accountsFilter = function( renderableRows ) {
    if ($scope.selectedaccounts == "allaccounts")
    {
        return renderableRows;
    }
    var rowIndexes = [];
    var txnMatched = false;
    for (var i = 0; i < renderableRows.length; i++)
    {
        if (renderableRows[i].entity.type == "transaction")
        {
            if (rowIndexes.length > 0)
            {
                if (!txnMatched)
                {
                    for (var j = 0; j < rowIndexes.length; j++)
                    {
                        renderableRows[rowIndexes[j]].visible = false;
                    }
                }
            }
            rowIndexes = [];
            txnMatched = false;
            rowIndexes.push(i);
        }
        else
        {
            if (renderableRows[i].entity.type == "posting")
            {
                if ('_' + renderableRows[i].entity.account == $scope.selectedaccounts)
                {
                    txnMatched = true;
                }
            }
            rowIndexes.push(i);
        }
    }
    if (rowIndexes.length > 0)
    {
        if (!txnMatched)
        {
            for (var j = 0; j < rowIndexes.length; j++)
            {
                renderableRows[rowIndexes[j]].visible = false;
            }
        }
    }
    if (renderableRows.length > 0 && renderableRows[renderableRows.length-1].entity.type == "transaction")
    {
        renderableRows[renderableRows.length-1].visible = true;
    }
    return renderableRows;
 };
 
 $scope.gridOptions.onRegisterApi = function(gridApi) {
          //set gridApi on scope
          $scope.gridApi = gridApi;
          $scope.gridApi.grid.registerRowsProcessor( $scope.accountsFilter, 200 );
          gridApi.edit.on.afterCellEdit($scope,function(rowEntity, colDef, newValue, oldValue){
            if ((colDef.name == "amount" || colDef.name == "account" || colDef.name == "otheraccount") && rowEntity.type == "transaction")
            {
                if (colDef.name == "amount")
                {
                    rowEntity.amount = null;
                }
                else if (colDef.name == "account")
                {
                    rowEntity.account = null;
                }
                else if (colDef.name == "otheraccount")
                {
                    rowEntity.otheraccount = null;
                }
                if (newValue != "")
                {
                    $scope.txnHint('put', rowEntity, colDef.name, newValue);
                }
            }
            for (var i = 0; i < $scope.gridOptions.data.length; i++)
            {
              if ($scope.gridOptions.data[i] == rowEntity)
              {
                if (newValue)
                {
                  if ($scope.gridOptions.data[i].type != "transaction" && $scope.gridOptions.data[i].type != "posting")
                  {
                    if (colDef.name == "date" || colDef.name == "payee" || colDef.name == "code")
                    {
                        $scope.gridOptions.data[i].type = "transaction";
                        $scope.gridOptions.data[i].$$treeLevel = 0;
                        if (colDef.name != "date")
                        {
                            $scope.gridOptions.data[i].date = new Date();
                        }
                        if (i > 0 && $scope.gridOptions.data[i-1].type == "posting")
                        {
                            $scope.gridOptions.data.splice(i, 0, {});
                            $scope.gridOptions.data.splice(i+2, 0, {});
                            if ($scope.selectedaccounts != "allaccounts")
                            {
                                $scope.gridOptions.data.splice(i+2, 0, {type: "posting", account: $scope.selectedaccounts.substr(1)});
                            }
                            else
                            {
                                $scope.gridOptions.data.splice(i+2, 0, {type: "posting"});
                            }
                        }
                        if (i==0)
                        {
                            $scope.gridOptions.data.splice(i+1, 0, {});
                            if ($scope.selectedaccounts != "allaccounts")
                            {
                                $scope.gridOptions.data.splice(i+1, 0, {type: "posting", account: $scope.selectedaccounts.substr(1)});
                            }
                            else
                            {
                                $scope.gridOptions.data.splice(i+1, 0, {type: "posting"});
                            }
                        }
                    }
                    else if (colDef.name == "account" || colDef.name == "amount")
                    {
                      $scope.gridOptions.data[i].type = "posting";
                      if (colDef.name != "amount" && i > 0 && $scope.gridOptions.data[i-1].type == "transaction")
                      {
                        $scope.gridOptions.data[i].amount = "$0.00";
                      }
                      $scope.gridOptions.data.splice(i+1, 0, {});
                    }
                    $scope.txnPositionCache = {};
                  }
                  else if ($scope.gridOptions.data[i].type == "transaction" && i == $scope.gridOptions.data.length - 1)
                  {
                    if (colDef.name == "date" || colDef.name == "payee" || colDef.name == "code")
                    {
                        if (colDef.name != "date" && !$scope.gridOptions.data[i].date)
                        {
                            $scope.gridOptions.data[i].date = new Date();
                        }
                        if ($scope.selectedaccounts != "allaccounts")
                        {
                            $scope.gridOptions.data.push({type: "posting", account: $scope.selectedaccounts.substr(1)});
                        }
                        else
                        {
                            $scope.gridOptions.data.push({type: "posting"});
                        }
                        $scope.gridOptions.data.push({});
                        $scope.gridOptions.data.push({type: "transaction", $$treeLevel: 0});
                    }
                  }
                }
                break;
              }
            }
          });
        };

   // Return array of string values, or NULL if CSV string not well formed
   $scope.CSVtoArray = function(text) {
       var re_valid = /^\s*(?:'[^'\\]*(?:\\[\S\s][^'\\]*)*'|"[^"\\]*(?:\\[\S\s][^"\\]*)*"|[^,'"\s\\]*(?:\s+[^,'"\s\\]+)*)\s*(?:,\s*(?:'[^'\\]*(?:\\[\S\s][^'\\]*)*'|"[^"\\]*(?:\\[\S\s][^"\\]*)*"|[^,'"\s\\]*(?:\s+[^,'"\s\\]+)*)\s*)*$/;
       var re_value = /(?!\s*$)\s*(?:'([^'\\]*(?:\\[\S\s][^'\\]*)*)'|"([^"\\]*(?:\\[\S\s][^"\\]*)*)"|([^,'"\s\\]*(?:\s+[^,'"\s\\]+)*))\s*(?:,|$)/g;
       // Return NULL if input string is not well formed CSV string.
       if (!re_valid.test(text)) return null;
       var a = [];                     // Initialize array to receive values.
       text.replace(re_value, // "Walk" the string using replace with callback.
           function(m0, m1, m2, m3) {
               // Remove backslash from \' in single quoted values.
               if      (m1 !== undefined) a.push(m1.replace(/\\'/g, "'"));
               // Remove backslash from \" in double quoted values.
               else if (m2 !== undefined) a.push(m2.replace(/\\"/g, '"'));
               else if (m3 !== undefined) a.push(m3);
               return ''; // Return empty string.
           });
       // Handle special case of empty last value.
       if (/,\s*$/.test(text)) a.push('');
       return a;
   };

   $scope.putDataToGrid = function (rawObjects) {
    var objects = [];
    $scope.rootScope.objects[$scope.loadedLedger] = angular.copy(rawObjects);
    for (var i = 0; i < rawObjects.length; i++){
      if (rawObjects[i].postings)
      {
          var postings = rawObjects[i].postings;
          delete rawObjects[i].postings;
          rawObjects[i].postings = undefined;
          rawObjects[i].type="transaction";
          rawObjects[i].$$treeLevel = 0;
          objects.push(rawObjects[i]);
          for (var j = 0; j < postings.length; j++){
              if ($scope.rootScope.globalAccounts.indexOf(postings[j].account) == -1)
              {
                  $scope.rootScope.globalAccounts.push(postings[j].account);
              }
              postings[j].type="posting";
              objects.push(postings[j]);
          }
          objects.push({});
      }
    }
    for (var i = 0; i < $scope.accountnames.length; i++)
    {
        if ($scope.rootScope.globalAccounts.indexOf($scope.accountnames[i]) == -1)
        {
            $scope.rootScope.globalAccounts.push($scope.accountnames[i]);
        }
    }
    objects.push({type: "transaction", $$treeLevel: 0});
    $scope.rootScope.globalAccounts.sort(function(a, b){
      if (a == "Create New Account...") { return -1; }
      if (b == "Create New Account...") { return 1; }
      return a.localeCompare(b);
    });
    for (var i = 0; i < objects.length; i++){
      if (objects[i].date)
      {
        objects[i].date = new Date(objects[i].date);
      }
      if (objects[i].status)
      {
        if (objects[i].status == "!")
        {
            objects[i].status = 2;
        }
        else if (objects[i].status == "*")
        {
            objects[i].status = 3;
        }
      }
    }
    if (objects.length == 0)
    {
        objects = [{}];
    }
    $scope.gridOptions.data = objects;
    $scope.txnPositionCache = {};
  }

  $scope.loadedLedger = null;
  $scope.loadedLedgerData = null;
  $scope.loadLedger = function(filename) {
    $rootScope.enableOverlay();
    $http.post($rootScope.apihost+"/", {"query": "getfile", "filename": filename, "creds": $rootScope.creds})
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
          var invert = filename.indexOf('budget') >= 0 ? true : false;
          var rawObjects = ledger2objects(data, invert);
          var rawObjectsNoInvert = ledger2objects(data, false);
          var testTranslation = objects2ledger(rawObjectsNoInvert, false).replace(/\s/g, "");
          if (data.replace(/\s/g, "") != testTranslation)
          {
            if (confirm("This program is not able to read the "+filename+" ledger due to translation issues.  Please click Cancel if you really want to process the ledger anyway, regardless of possible data loss."))
            {
                document.getElementById('editordiv').innerHTML = '';
                return;
            }
          }
          $scope.loadedLedger = filename;
          $scope.putDataToGrid(rawObjects);
          $scope.loadedLedgerData = objects2ledger($scope.getDataFromGrid());
        }
      }).error(function(data) {
        $rootScope.disableOverlay();
      });
  }

  $scope.changedLedger = function(item) {
    $scope.loadLedger(item.name);
  }
 
  $scope.getDataFromGrid = function() {
      var transactions = [];
      var postings = [];
      for (var i = 0; i < $scope.gridOptions.data.length; i++) {
        if ($scope.gridOptions.data[i].type == "transaction")
        {
            if ($scope.gridOptions.data[i].date && $scope.gridOptions.data[i].payee)
            {
                if (postings.length > 0)
                {
                    transactions[transactions.length-1].postings = postings;
                    postings = [];
                }
                transactions.push(angular.copy($scope.gridOptions.data[i]));
                var tdate = new Date(transactions[transactions.length-1].date);
                transactions[transactions.length-1].date = tdate.getFullYear() + "/" + pad(tdate.getMonth()+1, 2) + "/" + pad(tdate.getDate(), 2);
                if ($scope.gridOptions.data[i].status == 2)
                {
                    transactions[transactions.length-1].status = "!";
                }
                else if ($scope.gridOptions.data[i].status == 3)
                {
                    transactions[transactions.length-1].status = "*";
                }
            }
        }
        else if ($scope.gridOptions.data[i].type == "posting")
        {
            postings.push(angular.copy($scope.gridOptions.data[i]));
            if ($scope.gridOptions.data[i].status == 2)
            {
                postings[postings.length-1].status = "!";
            }
            else if ($scope.gridOptions.data[i].status == 3)
            {
                postings[postings.length-1].status = "*";
            }
        }
      }
      if (postings.length > 0)
      {
          transactions[transactions.length-1].postings = postings;
      }
      return transactions;
  }

  $scope.saveData = function() {
      var invert = $scope.loadedLedger.indexOf('budget') >= 0 ? true : false;
      $rootScope.enableOverlay();
      $http.post($rootScope.apihost+"/", {"query": "savefile", "filename": $scope.loadedLedger, "contents": objects2ledger($scope.getDataFromGrid(), invert), "creds": $rootScope.creds})
      .success(function(data) {
          $rootScope.disableOverlay();
          $scope.loadedLedgerData = objects2ledger($scope.getDataFromGrid());
      })
      .error(function(data) {
          $rootScope.disableOverlay();
          alert("Failed to save data");
      });
    }

  $scope.commitToMain = function() {
    
    $rootScope.enableOverlay();
    $http.post($rootScope.apihost+"/", {"query": "getfile", "filename": "/onlineimport.ledger", "creds": $rootScope.creds})
      .success(function(importeddata) {
        $rootScope.disableOverlay();
        if (importeddata.error)
        {
          alert("Failed to get imported data" + importeddata.error);
        }
        else
        {
          importeddata = importeddata["contents"];
          if (importeddata == objects2ledger($scope.getDataFromGrid(), false))
          {
            $rootScope.enableOverlay();
            $http.post($rootScope.apihost+"/", {"query": "getfile", "filename": "/online.ledger", "creds": $rootScope.creds})
              .success(function(maindata) {
                $rootScope.disableOverlay();
                if (maindata.error)
                {
                    alert("Failed to load ledger file: " + maindata.error);
                }
                else
                {
                  maindata = maindata["contents"];
                  var dataToSave = maindata + (maindata.endsWith('\n\n') ? '' : (maindata.endsWith('\n') ? '\n' : '\n\n' )) + importeddata;
                  $rootScope.enableOverlay();
                  $http.post($rootScope.apihost+"/", {"query": "validate", "contents": dataToSave, "creds": $rootScope.creds})
                  .success(function(validation) {
                    $rootScope.disableOverlay();
                    if (validation.error)
                    {
                      alert("Cannot commit ledger due to the following errors: " + validation.error);
                    }
                    else
                    {
                      if (Math.abs((validation.output.length - dataToSave.length) / dataToSave.length) < 0.05)
                      {
                        dataToSave = validation.output;
                      }
                      else
                      {
                        alert("Server seemed to lose some of the data while trying to sort the ledger which seems to be bad. Saving unsorted data.");
                      }
                      $rootScope.enableOverlay();
                      $http.post($rootScope.apihost+"/", {"query": "savefile", "filename": "/online.ledger", "contents": dataToSave, "creds": $rootScope.creds})
                      .success(function(data) {
                        $http.post($rootScope.apihost+"/", {"query": "savefile", "filename": "/onlineimport.ledger", "contents": "\n", "creds": $rootScope.creds})
                        .success(function(data) {
                          $rootScope.disableOverlay();
                          $scope.loadLedger('/onlineimport.ledger');
                        })
                        .error(function(data) {
                            $rootScope.disableOverlay();
                            alert("Failed to blank imported ledger data");
                        });
                      })
                      .error(function(data) {
                          $rootScope.disableOverlay();
                          alert("Failed to save main ledger data");
                      });
                    }
                  })
                  .error(function(data) {
                      $rootScope.disableOverlay();
                      alert("Failed to validate combined ledger data");
                  });
                }
              })
              .error(function(data) {
                $rootScope.disableOverlay();
                alert('Failed to load data');
              });
          }
          else
          {
            alert('Imported data has not been saved or has changed on the server.  Please save imported data first.');
          }
        }
      })
      .error(function(data) {
        $rootScope.disableOverlay();
        alert('Failed to load data');
      });
  }
}])
 
.filter('mapStatus', function() {
  return function(input) {
    if (!input){
      return '';
    } else if (input == 1) {
        return '';
    } else if (input == 2) {
        return '!';
    } else if (input == 3) {
        return '*';
    }
  };
});

app.controller('RawLedgerEditorCtrl', function ($scope, $rootScope, $http, $uibModalInstance, text, creds, apihost) {
  $scope.edittext = text;
  $scope.originaledittext = text;
  $scope.creds = creds;
  $scope.apihost = apihost;

  $scope.ok = function () {
    if ($scope.edittext[$scope.edittext.length-1] != '\n')
    {
        $scope.edittext = $scope.edittext + '\n';
    }
    $rootScope.enableOverlay();
    $http.post($scope.apihost+"/", {"query": "validate", "contents": $scope.edittext, "creds": $scope.creds})
    .success(function(validation) {
      $rootScope.disableOverlay();
      if (validation.error)
      {
        alert("Ledger has the following errors: " + validation.error);
      }
      else
      {
        var objs = ledger2objects($scope.edittext, false);
        var testTranslation = objects2ledger(objs, false).replace(/\s/g, "");
        if ($scope.edittext.replace(/\s/g, "") != testTranslation)
        {
          if (confirm("This program is not able to read the edited ledger due to translation issues.  Please click Cancel if you really want to process the ledger anyway, regardless of possible data loss."))
          {
              return;
          }
        }
        $uibModalInstance.close($scope.edittext);
      }
    }).error(function(data) {
      $rootScope.disableOverlay();
    });
  };

  $scope.cancel = function () {
    $uibModalInstance.dismiss('cancel');
  };
  $scope.$on('modal.closing', function(event, reason, closed) {
    if ($scope.edittext != $scope.originaledittext)
    {
      var message = false;
      switch (reason){
          // clicked outside
          case "backdrop click":
              message = "You have unsaved changed in the text-based ledger editor.  Are you sure you want to continue?";
              break;

          // cancel button
          case "cancel":
              message = "You have unsaved changed in the text-based ledger editor.  Are you sure you want to continue?";
              break;

          // escape key
          case "escape key press":
              message = "You have unsaved changed in the text-based ledger editor.  Are you sure you want to continue?";
              break;
      }
      if (message && !confirm(message)) {
          event.preventDefault();
      }
    }
  });
});

app.controller('PromptCodeCtrl', function ($scope, $rootScope, $http, $uibModalInstance) {
  $scope.ok = function () {
    $uibModalInstance.close($scope.code);
  };
  $scope.cancel = function () {
    $uibModalInstance.dismiss('cancel');
  };
  $scope.code="";
});

app.controller('NewAccountCtrl', function ($scope, $rootScope, $http, $uibModalInstance, expenseincome) {
  $scope.ok = function () {
    $uibModalInstance.close({name: $scope.accounttype+$scope.accountname, initialbalance: $scope.initialbalance});
  };
  $scope.cancel = function () {
    $uibModalInstance.dismiss('cancel');
  };
  $scope.$on('modal.closing', function(event, reason, closed) {
    // Don't support cancel for expenses/income accounts because that is in the middle of a selection workflow
    if ($scope.expenseincome && (reason == "escape key press" || reason == "backdrop click"))
    {
      event.preventDefault();
    }
  });
  $scope.expenseincome = expenseincome;
  $scope.initialbalance = "$0.00";
  $scope.accounttype=(expenseincome?"Expenses:" :"Assets:");
  $scope.accountname="";
});

