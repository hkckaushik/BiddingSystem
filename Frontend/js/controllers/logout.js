angular.module('app')
    .controller('LogoutCtrl', function ($location, $auth, toastr, ngCart) {
        if (!$auth.isAuthenticated()) {
            return;
        }
        $auth.logout()
            .then(function () {
                toastr.info('You have been logged out');
                $location.path('/home/login');
                ngCart.empty();
            });
    });