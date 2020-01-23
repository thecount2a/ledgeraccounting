(function(){

    var globalAccounts = ['Create New Account...'];
    var CognitoUserPool = AmazonCognitoIdentity ? AmazonCognitoIdentity.CognitoUserPool : null;


    var app = angular.module("routedTabs", ['ui.router', 'ui.bootstrap', 'ui.bootstrap.modal', 'ngTouch', 'ui.grid', 'ui.grid.edit', 'ui.grid.cellNav', 'ui.grid.autoScroll', 'ui.grid.pinning', 'ui.grid.selection', 'ui.grid.treeView', 'ui.grid.resizeColumns', 'ui.grid.exporter', 'ui.select']);

    app.config(function($stateProvider, $urlRouterProvider){

        $urlRouterProvider.otherwise("/main/reports");

        $stateProvider
            .state("main", { abtract: true, url:"/main", templateUrl:"main.html" })
                .state("main.reports", { url: "/reports?report&time&timeperiod&accounts&historical", 
                                            templateUrl: "reports.html", controller: "reportsCtrl"})
                .state("main.editor", { url: "/editor?ledger&accounts", templateUrl: "editor.html", controller: "editorCtrl"})
                .state("main.budget", { url: "/budget?time&timeperiod&budgetperiod", 
                                            templateUrl: "budget.html", controller: "reportsCtrl"});

    });


    app.directive('uiSelectWrap', function($document, uiGridEditConstants) {
        return function link($scope, $elm, $attr) {
          $document.on('click', docClick);
          
          function docClick(evt) {
            if ($(evt.target).closest('.ui-select-container').size() === 0) {
              $scope.$emit(uiGridEditConstants.events.END_CELL_EDIT);
              $document.off('click', docClick);
            }
          }
        };
    });

    app.directive('customOnChange', function() {
      return {
        restrict: 'A',
        link: function (scope, element, attrs) {
          var onChangeHandler = scope.$eval(attrs.customOnChange);
          element.on('change', onChangeHandler);
          element.on('$destroy', function() {
            element.off();
          });

        }
      };
    });

    app.controller('LoginCtrl', function ($scope, $rootScope, $http, $uibModalInstance, $timeout, $uibModal, $state) {
      $scope.dataLoading = false;
      $scope.loginState = $rootScope.creds ? "selectledger" : "login";
      $scope.submitbuttontext = "Login";
      $scope.username = "";
      $scope.password = "";
      $scope.email = "";
      $scope.cellphone = "";
      $scope.verifycode = "";
      $scope.repeatpassword = "";
      $scope.activeitem = null;
      $scope.selectLogin = function (state) {
        $scope.loginState = state;
        if (state == "login")
        {
            $scope.submitbuttontext = "Login";
        }
        else if (state == "selectledger")
        {
            $scope.submitbuttontext = "Open";
        }
        else
        {
            $scope.submitbuttontext = "Register";
        }
      };
      $scope.createNewLedger = function() {
          var newName = prompt("Please enter a name for the new ledger", "Home Finances");
          if (!newName)
          {
            return;
          }
          $scope.dataLoading = true;
          var newItem = {"id": nacl.util.encodeBase64(nacl.randomBytes(24)).replace(/\//g,'_').replace(/\+/g,'-'), "name": newName, "key" : nacl.util.encodeBase64(nacl.randomBytes(32)), "owner": $rootScope.creds.awsIdentityId, "sharedWith": []};
          newItem.ledgerPrefix = "shared/" + $rootScope.creds.awsIdentityId + "-/" + newItem.id;
          $scope.index.ledgers.push( newItem );
          var box = nacl.secretbox(nacl.util.decodeUTF8(JSON.stringify($scope.index)), $scope.indexNonceBuff, $rootScope.localEncryptionKeyBuff);
          var newIndexPair = nacl.util.encodeBase64($scope.indexNonceBuff) + ":" + nacl.util.encodeBase64(box);
          $rootScope.s3.putObject({ Bucket: "ledgeraccounting", Key: $rootScope.creds.awsIdentityId + "/index", Body: newIndexPair }, function(error, data) {
              $scope.dataLoading = false;
              if (error)
              {
                  alert(error);
              }
              else
              {
                  console.log("Successfully saved updated index");
              }
              $scope.$apply();
          }); 
           
      };
      $scope.loadLedgerList = function() {
        $rootScope.getIndex($scope, function(error) {
           $scope.dataLoading = false;
           if (error == "notloggedin")
           {
              // Should never happen
              alert(error);
           }
           else if (error)
           {
               $scope.index = { ledgers: [] };
               $scope.indexNonceBuff = nacl.randomBytes(24);
               var box = nacl.secretbox(nacl.util.decodeUTF8(JSON.stringify($scope.index)), $scope.indexNonceBuff, $rootScope.localEncryptionKeyBuff);
               var newIndexPair = nacl.util.encodeBase64($scope.indexNonceBuff) + ":" + nacl.util.encodeBase64(box);
               $rootScope.s3.putObject({ Bucket: "ledgeraccounting", Key: $rootScope.creds.awsIdentityId + "/index", Body: newIndexPair }, function(error, data) {
                   $scope.dataLoading = false;
                   if (error)
                   {
                       alert(error);
                   }
                   else
                   {
                       console.log("Successfully generated index");
                       $scope.selectLogin("selectledger");
                   }
                   $scope.$apply();
               }); 
           }
           else
           {
               console.log("Successfully loaded index");
               $scope.selectLogin("selectledger");
           }
        });
      }
      $scope.cognitoLogin = function() {
        var authenticationData = {
            Username : $scope.username,
            Password : $scope.password,
        };
        var authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails(authenticationData);
        var userData = {
            Username : $scope.username,
            Pool : $rootScope.userPool
        };
        $rootScope.cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);
        $rootScope.cognitoUser.authenticateUser(authenticationDetails, {
            onSuccess: function (result) {
                $rootScope.token = result.getAccessToken().getJwtToken();
                $http.defaults.headers.post['Authorization'] = 'Bearer ' + result.getAccessToken().getJwtToken();

                AWS.config.region = 'us-east-1';

                AWS.config.credentials = new AWS.CognitoIdentityCredentials({
                    IdentityPoolId : 'us-east-1:d65d6911-4210-4231-b406-b3905188ee74', // your identity pool id here
                    Logins : {
                        // Change the key below according to the specific region your user pool is in.
                        'cognito-idp.us-east-1.amazonaws.com/us-east-1_OtLq5WRwj' : result.getIdToken().getJwtToken()
                    }
                });

                //refreshes credentials using AWS.CognitoIdentity.getCredentialsForIdentity()
                $rootScope.doRefresh(result, function() {
                    $rootScope.localEncryptionKeyBuff = sha256.pbkdf2(nacl.util.decodeUTF8($scope.password), nacl.util.decodeUTF8('encryption:'+$scope.username), 10000, 32);
                    localStorage.setItem('localEncryptionKeyBuff', nacl.util.encodeBase64($rootScope.localEncryptionKeyBuff));
                    $scope.loadLedgerList();
                });
            },

            onFailure: function(err) {
                $scope.dataLoading = false;
                if (err.code == "UserNotConfirmedException")
                {
                  console.log("Matched user not confirmed");
                  $scope.selectLogin("verifycode");
                }
                else
                {
                 alert(err);
                }
                $scope.$apply();
            },

        });
      };

      $scope.selectLedger = function(item)
      {
        $scope.activeitem = item.id;
      };

      $scope.onKonamiCode = function(cb) {
        var input = '';
        var key = '38384040373937396665';
        document.addEventListener('keydown', function (e) {
          input += ("" + e.keyCode);
          if (input === key) {
            return cb();
          }
          if (!key.indexOf(input)) return;
          input = ("" + e.keyCode);
        });
      }

      $scope.onKonamiCode(function () {
        if (!$scope.indexNonceBuff)
        {
          return;
        }
        var val = prompt("Index JSON", JSON.stringify($scope.index));
        if (val)
        {
          $scope.index = JSON.parse(val);

          var box = nacl.secretbox(nacl.util.decodeUTF8(JSON.stringify($scope.index)), $scope.indexNonceBuff, $rootScope.localEncryptionKeyBuff);
          var newIndexPair = nacl.util.encodeBase64($scope.indexNonceBuff) + ":" + nacl.util.encodeBase64(box);
          $rootScope.s3.putObject({ Bucket: "ledgeraccounting", Key: $rootScope.creds.awsIdentityId + "/index", Body: newIndexPair }, function(error, data) {
              $scope.dataLoading = false;
              if (error)
              {
                  alert(error);
              }
              else
              {
                  console.log("Successfully saved updated index");
              }
              $scope.$apply();
          }); 
        }
      });

      $scope.login = function () {
        $scope.dataLoading = true;
        if ($scope.loginState == "register")
        {
          if (CognitoUserPool)
          {
            var attributeList = [];

            var dataEmail = {
                Name : 'email',
                Value : $scope.email
            };

            var attributeEmail = new AmazonCognitoIdentity.CognitoUserAttribute(dataEmail);

            attributeList.push(attributeEmail);
            if ($scope.cellphone != "")
            {
               var phonenum = $scope.cellphone;
               if (phonenum.length == 10)
               {
                  // Assume US phone number
                  phonenum = "+1" + phonenum;
               }
               var dataPhoneNumber = {
                   Name : 'phone_number',
                   Value : phonenum
               };
               var attributePhoneNumber = new AmazonCognitoIdentity.CognitoUserAttribute(dataPhoneNumber);
               attributeList.push(attributePhoneNumber);
            }

            $rootScope.userPool.signUp($scope.username, $scope.password, attributeList, null, function(err, result){
                if (err) {
                    alert(err);
                    $scope.dataLoading = false;
                    return;
                }
                $rootScope.cognitoUser = result.user;
                $scope.selectLogin("verifycode");
                $scope.dataLoading = false;
                $scope.$apply();
                //console.log('user name is ' + $rootScope.cognitoUser.getUsername());
            });
          }
        }
        else if ($scope.loginState == "verifycode")
        {
          $rootScope.cognitoUser.confirmRegistration($scope.verifycode, true, function(err, result) {
              if (err) {
                  alert(err);
                  $scope.dataLoading = false;
                  $scope.$apply();
                  return;
              }
              console.log('call result: ' + result);
              $scope.cognitoLogin();
          });
        }
        else if ($scope.loginState == "login")
        {
          $scope.cognitoLogin();
        }
        else if ($scope.loginState == "selectledger")
        {
          for (var i = 0; i < $scope.index.ledgers.length; i++)
          {
            if ($scope.index.ledgers[i].id == $scope.activeitem)
            {
              $rootScope.creds.encryptionKey = $scope.index.ledgers[i].key;
              $rootScope.creds.ledgerPrefix = $scope.index.ledgers[i].ledgerPrefix;
              $rootScope.ledgerName = $scope.index.ledgers[i].name;
              $rootScope.ledgerIndex = i;
              localStorage.setItem('encryptionKey', $scope.index.ledgers[i].key);
              localStorage.setItem('ledgerPrefix', $scope.index.ledgers[i].ledgerPrefix);
              localStorage.setItem('ledgerIndex', $rootScope.ledgerIndex);
              $uibModalInstance.dismiss('cancel');
              $state.go($state.current, {}, {reload: true});
              $rootScope.alreadyLoaded = true;
            }
          }
        }
      };
    
      $scope.cancel = function () {
        $uibModalInstance.dismiss('cancel');
      };
      $scope.$on('modal.closing', function(event, reason, closed) {
        if (reason != "cancel")
        {
          event.preventDefault();
        }
      });
    });

    app.controller("mainController", function($rootScope, $scope, $state, $http, $uibModal, $location) {

        $scope.openAccountManager = function() {
            var modalInstance = $uibModal.open({
              animation: true,
              templateUrl: 'accountmanager.html',
              controller: 'AccountManagerCtrl',
              windowClass: 'my-modal-window',
            });

            modalInstance.result.then(function () {
              $state.go($state.current, {}, {reload: true});
            });
        };

        $scope.go = function(route){
            $state.go(route);
        };

        $scope.active = function(route){
            return $state.is(route);
        };

        $scope.activetab = null;

        $scope.tabs = [
            { heading: "Reports", route:"main.reports", active:false },
            { heading: "Ledger", route:"main.editor", active:false },
            { heading: "Budget", route:"main.budget", active:false },
        ];

        $scope.$on("$stateChangeSuccess", function(event, next, current) {
            for (var i = 0; i < $scope.tabs.length; i++)
            {
                if ($scope.active($scope.tabs[i].route))
                {
                    $scope.activetab = i;
                }
            }
        });

        if ($location.host().endsWith("amazonaws.com") || $location.host().endsWith("ledgeraccounting.org"))
        {
            $rootScope.apihost = "https://q39zk6ggr4.execute-api.us-east-2.amazonaws.com/beta";
        }
        else
        {
            $rootScope.apihost = "";
        }

        $rootScope.objects = {};

        $rootScope.poolData = {
            UserPoolId: 'us-east-1_OtLq5WRwj',
            ClientId: '3hs1kpq5sg35devvc7qsicen97'
        };
        $rootScope.userPool = new AmazonCognitoIdentity.CognitoUserPool($rootScope.poolData);
        $rootScope.cognitoUser = $rootScope.userPool.getCurrentUser();
        $rootScope.setupCreds = function(session, callback) {

            $rootScope.token = session.getAccessToken().getJwtToken();
            $http.defaults.headers.post['Authorization'] = 'Bearer ' + session.getAccessToken().getJwtToken();
            // Instantiate aws sdk service objects now that the credentials have been updated.
            $rootScope.s3 = new AWS.S3({region: 'us-east-2'});
            $rootScope.creds = {};
            $rootScope.creds.awsIdentityId = AWS.config.credentials.identityId;
            $rootScope.creds.awsAccessKeyId = AWS.config.credentials.accessKeyId;
            $rootScope.creds.awsSecretAccessKey = AWS.config.credentials.secretAccessKey;
            $rootScope.creds.awsSessionToken = AWS.config.credentials.sessionToken;
            callback();

        };
        $rootScope.doRefresh = function(session, callback) {
            AWS.config.credentials.refresh((error) => {
                if (error) {
                     alert(error);
                } else {
                     $rootScope.setupCreds(session, callback);
                }
            });
        };

        if (!$rootScope.overlayCount)
        {
            $rootScope.overlayCount = 0;
        }
        $rootScope.enableOverlay = function() {
            if ($rootScope.overlayCount == 0)
            {
                document.getElementById('loadingOverlay').style.display='block';
            }
            $rootScope.overlayCount++;
        };
        $rootScope.disableOverlay = function() {
            if ($rootScope.overlayCount <= 1)
            {
                document.getElementById('loadingOverlay').style.display='none';
            }
            if ($rootScope.overlayCount > 0)
            {
                $rootScope.overlayCount--;
            }
        };
        $rootScope.getIndex = function(localscope, finishedcallback) {
            if (!$rootScope.s3)
            {
              finishedcallback("notloggedin");
            }
            else
            {
              $rootScope.s3.getObject({ Bucket: "ledgeraccounting", Key: $rootScope.creds.awsIdentityId + "/index" }, function(error, data) {
                 if (error)
                 {
                      finishedcallback(error);
                 }
                 else
                 {
                    var pair = nacl.util.encodeUTF8(data.Body).split(':');
                    localscope.indexNonceBuff = nacl.util.decodeBase64(pair[0]);
                    var decryptedData = nacl.secretbox.open(nacl.util.decodeBase64(pair[1]), localscope.indexNonceBuff, $rootScope.localEncryptionKeyBuff);
                    if (!decryptedData)
                    {
                        error = true;
                        alert("Unable to decrypt index, this account has been corrupted");
                        finishedcallback(error);
                    }
                    else
                    {
                        localscope.index = JSON.parse(nacl.util.encodeUTF8(decryptedData));
                        finishedcallback(error);
                    }
                    localscope.$apply();
                 }
              });
            }
        };

        if ($rootScope.cognitoUser == null)
        {
            var modalInstance = $uibModal.open({
              animation: true,
              templateUrl: 'login.html',
              controller: 'LoginCtrl',
            });
        }
        else
        {
            AWS.config.region = 'us-east-1';
            $rootScope.cognitoUser.getSession(function(err, session) {
                if (err) {
                    alert(err.message || JSON.stringify(err));
                    return;
                }
                AWS.config.credentials = new AWS.CognitoIdentityCredentials({
                    IdentityPoolId: 'us-east-1:d65d6911-4210-4231-b406-b3905188ee74',
                    Logins : {
                        // Change the key below according to the specific region your user pool is in.
                        'cognito-idp.us-east-1.amazonaws.com/us-east-1_OtLq5WRwj' : session.getIdToken().getJwtToken()
                    }
                });
                $rootScope.doRefresh(session, function() {

                    $rootScope.localEncryptionKeyBuff = nacl.util.decodeBase64(localStorage.getItem('localEncryptionKeyBuff'));
                    $rootScope.creds.encryptionKey = localStorage.getItem('encryptionKey');
                    $rootScope.creds.ledgerPrefix = localStorage.getItem('ledgerPrefix');
                    $rootScope.ledgerIndex = Number(localStorage.getItem('ledgerIndex'));

                    if (!$rootScope.alreadyLoaded)
                    {
                        $state.go($state.current, {}, {reload: true});
                        $rootScope.alreadyLoaded = true;
                    }
                    else
                    {
                        angular.forEach(['/online.ledger', '/onlinebudget.ledger', '/onlineimport.ledger'], function(filename, ind) {
                          $rootScope.enableOverlay();
                          $http.post($rootScope.apihost+"/", {"query": "getfile", "filename": filename, "creds": $rootScope.creds})
                            .success(function(data) {
                              $rootScope.disableOverlay();
                              if (data.error)
                              {
                                if (data.error != "Missing Auth Header")
                                {
                                   alert("Failed to get ledger file " + filename + ": " + data.error);
                                }
                              }
                              else
                              {
                                data = data["contents"];
                                var invert = filename.indexOf('budget') >= 0 ? true : false;
                                var rawObjects = ledger2objects(data, invert);
                                var rawObjectsNoInvert = ledger2objects(data, false);
                                var objects = [];
                                var testTranslation = objects2ledger(rawObjectsNoInvert, false).replace(/\s/g, "");
                                if (data.replace(/\s/g, "") != testTranslation)
                                {
                                  if (confirm("This program is not able to read the "+filename+" ledger due to translation issues.  Please click Cancel if you really want to process the ledger anyway, regardless of possible data loss."))
                                  {
                                      document.getElementById('editordiv').innerHTML = '';
                                      return;
                                  }
                                }
                                $rootScope.objects[filename] = angular.copy(rawObjects);
                              }
                            }).error(function(data) {
                                $rootScope.disableOverlay();
                            });
                        });
                    }
                });
            });
        }
    });



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
          globalAccounts.sort(function(a, b){
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
    { name: 'account', displayName: 'Account', editableCellTemplate: 'uiSelect',  width: '22%',  editDropdownOptionsArray: globalAccounts, cellTemplate: cellTemp.replace("{{COL_FIELD CUSTOM_FILTERS}}", "<span ng-if=\"row.treeNode.state=='collapsed' && row.entity.type=='transaction'\">{{grid.appScope.txnHint('get', row.entity, 'account')}}</span><span ng-if=\"row.treeNode.state!='collapsed' || row.entity.type!='transaction'\">{{COL_FIELD CUSTOM_FILTERS}}</span>"), cellEditableCondition: function(s) { return hintCellEditable(s, 'account'); }, enableSorting: false },
    { name: 'amount', displayName: 'Amount', width: '10%', cellTemplate: cellTemp.replace("{{COL_FIELD CUSTOM_FILTERS}}", "<span ng-if=\"row.treeNode.state=='collapsed' && row.entity.type=='transaction'\">{{grid.appScope.txnHint('get', row.entity, 'amount')}}</span><span ng-if=\"row.treeNode.state!='collapsed' || row.entity.type!='transaction'\">{{COL_FIELD CUSTOM_FILTERS}}</span>"), cellEditableCondition: function(s) { return hintCellEditable(s, 'amount'); }, enableSorting: false },
    { name: 'otheraccount', displayName: 'Other Account', editableCellTemplate: 'uiSelect',  width: '22%',  editDropdownOptionsArray: globalAccounts, cellTemplate: cellTemp.replace("{{COL_FIELD CUSTOM_FILTERS}}", "<span ng-if=\"row.treeNode.state=='collapsed' && row.entity.type=='transaction'\">{{grid.appScope.txnHint('get', row.entity, 'otheraccount')}}</span><span ng-if=\"row.treeNode.state!='collapsed' || row.entity.type!='transaction'\">{{COL_FIELD CUSTOM_FILTERS}}</span>"), cellEditableCondition: function(s) { return hintCellEditable(s, 'otheraccount'); }, enableSorting: false },
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
              if (globalAccounts.indexOf(postings[j].account) == -1)
              {
                  globalAccounts.push(postings[j].account);
              }
              postings[j].type="posting";
              objects.push(postings[j]);
          }
          objects.push({});
      }
    }
    for (var i = 0; i < $scope.accountnames.length; i++)
    {
        if (globalAccounts.indexOf($scope.accountnames[i]) == -1)
        {
            globalAccounts.push($scope.accountnames[i]);
        }
    }
    objects.push({type: "transaction", $$treeLevel: 0});
    globalAccounts.sort(function(a, b){
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
})
;

}());

