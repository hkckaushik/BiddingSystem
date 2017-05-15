angular.module('app')
    .factory('CartService', function ($http,ngCart) {
        return {
            saveCart:function(cart){
                return $http.post(appSettings.serviceURL+'/api/cart',cart);
            },
            getCart:function(cart){
                return $http.get(appSettings.serviceURL+'/api/cart');
            },
            checkout:function(){
                // ngCart.setSettings({url:appSettings.serviceURL+"/api/checkout"});
                return $http.post(appSettings.serviceURL+'/api/checkout',ngCart.getCart());
                // return ngCart.checkout({url:appSettings.serviceURL+"/api/checkout"})
            },
            emptyCart:function(){
                ngCart.emptyCart();
            }
        };
    });