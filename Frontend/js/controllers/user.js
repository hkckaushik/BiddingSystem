angular.module('app')
    .controller('UserCtrl', function($scope, $auth,Account,toastr,$timeout,CartService,ngCart) {
        $scope.title = " Post a request";
        $scope.disabled = false;

        $scope.isAuthenticated = function() {
            return $auth.isAuthenticated();
        };

        var promise = Account.lastLoginInfo();
        promise.then(function (res) {
            $scope.lastLoginInfo = res.data;
            if(!$.isEmptyObject($scope.lastLoginInfo))
                $scope.loginTemplate="" +
                    "Login Location : "+$scope.lastLoginInfo.lastLocation.city+", "+$scope.lastLoginInfo.lastLocation.region +
                    "<br/>Login Time : "+$scope.lastLoginInfo.lastLoggedTime;
            else{
                $scope.loginTemplate="This is your first login";
            }
        },function (error) {
            toastr.error(error.data.message, error.status);
        });

        $scope.openPopover = function(){
            $('.popovers').popover('show');
        };

        $scope.closePopover = function(){
            $('.popovers').popover('hide');
        };

        CartService.getCart()
            .then(function(response){
                var cart = response.data.cart;
                for(var i=0;i<cart.length;i++){
                    item = cart[i];
                    ngCart.addItem(id=item._id,name=item._name,price=item._price,quantity=item._quantity,maxquantity=item._maxquantity,data=item._data);
                }
            },function(error){
                toastr.error(error.data.message, error.status);
            });

        $(window).resize(function(){
            $('.homebody').css('height',$(window).innerHeight());
        });
        $('.homebody').css('height',$(window).innerHeight());
    });
