angular.module('app')
    .controller('ChangePwdCtrl', function ($scope, $auth, toastr, Account) {
        $scope.changePassword = function () {
            // if ($scope.user.newpwd == $scope.user.cnewpwd) {
            $scope.passwords = {};
            $scope.passwords.new = $scope.user.newpwd;
            $scope.passwords.old = $scope.user.oldpwd;
            Account.updatePassword($scope.passwords)
                .then(function () {
                    toastr.success('Profile has been updated');
                })
                .catch(function (response) {
                    toastr.error(response.data.message, response.status);
                });
        };


        $scope.validate = function () {
            $scope.changeForm.cnewpwd.$setValidity("notsame",false);
            if ($scope.user.newpwd == $scope.user.cnewpwd) {
                $scope.changeForm.cnewpwd.$setValidity("notsame",true);
            }
            else{
                $scope.changeForm.cnewpwd.$setValidity("notsame",false);
            }
        }
    });
