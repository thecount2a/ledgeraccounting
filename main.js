// Controller of main "container" page of single page application
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

    $rootScope.globalAccounts = ['Create New Account...'];
    $rootScope.CognitoUserPool = AmazonCognitoIdentity ? AmazonCognitoIdentity.CognitoUserPool : null;

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
