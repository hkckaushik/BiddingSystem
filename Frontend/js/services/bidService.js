angular.module('app')
    .factory('BidService', function ($http) {
        return {
            savePost: function (postData) {
                return $http.post(appSettings.serviceURL + '/api/post',postData);
            },
            getAllPosts: function () {
                return $http.get(appSettings.serviceURL + '/api/post');
            },
            getMyPosts: function () {
                return $http.get(appSettings.serviceURL + '/api/myposts');
            },
            getPostbyId:function(id){
                return $http.get(appSettings.serviceURL+'/api/post/'+id);
            },
            saveBid:function(postId,bidData){
                return $http.post(appSettings.serviceURL+'/api/'+postId+'/bid',bidData)
            },
            getBidsbyPostId:function(id){
                return $http.get(appSettings.serviceURL+'/api/bids/'+id);
            },
            getIsMyPost:function(id){
                return $http.get(appSettings.serviceURL+'/api/isMyPost/'+id);
            }
        };
    });