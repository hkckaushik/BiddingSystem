angular.module('app')
    .controller('MyPostsCtrl', function ($scope, $auth, toastr, $timeout, BidService, NgTableParams,$location) {

        $scope.title="My Posts";

        BidService.getMyPosts().then(function(data) {
            // params.total(data); // recal. page nav controls
            $scope.dataSet = data.data;
            $timeout(function(){
                $scope.tableParams = new NgTableParams({
                    // initial sort order
                    sorting: { createdAt: "desc" }
                }, {
                    dataset: $scope.dataSet
                });
            });
        });

        $scope.convert= function(date){
            return moment(date).fromNow();
        };

        $scope.view= function(data){
            $location.path('/user/bid/'+data._id);
        }
    });
