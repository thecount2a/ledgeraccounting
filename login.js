// Login and encryption/decryption controller
app.controller('LoginCtrl', function ($scope, $rootScope, $http, $uibModalInstance, $timeout, $uibModal, $state) {
  // Setup default values
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
      if ($rootScope.CognitoUserPool)
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
