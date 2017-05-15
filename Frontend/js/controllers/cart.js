angular.module('app')
    .controller('CartCtrl', function ($scope, $state, $auth, toastr, ngCart,CartService) {
        $scope.httpSettings = { url: appSettings.serviceURL+'/api/checkout'};

        $scope.checkout = function(){
            CartService.checkout()
                .then(function(){
                    ngCart.empty();
                    toastr.success('Your order has been placed and an email has been sent to you');
                    $state.go('search');
                },function(){
                    toastr.error('Error occurred while placing the order');
                });
        };

        $scope.getTotalItems = function(){
            return ngCart.getTotalItems();
        }

    });
