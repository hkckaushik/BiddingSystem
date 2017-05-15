angular.module('app')
    .factory('logInterceptor', function ($q) {
    return {
        // optional method
        'request': function(config) {
            // do something on success
            // console.log(config);
            return config;
        },
        // optional method
        'response': function(response) {
            // do something on success
            // return response;
            // console.log(response);
            return response;
        }
    };

});

// $httpProvider.interceptors.push('myHttpInterceptor');
