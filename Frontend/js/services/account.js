angular.module('app')
    .factory('Account', function ($http) {
        return {
            getProfile: function () {
                return $http.get(appSettings.serviceURL + '/api/me');
            },
            updateProfile: function (profileData) {
                return $http.post(appSettings.serviceURL + '/api/me', profileData);
            },
            updatePassword: function (passwords) {
                return $http.post(appSettings.serviceURL + '/api/updatepwd', passwords)
            },
            lastLoginInfo : function(){
                return $http.get(appSettings.serviceURL+'/api/prevloginInfo');
            }
        };
    });