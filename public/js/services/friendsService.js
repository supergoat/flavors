angular.module('friendsService', []).factory('friendsFactory', 
	['$http', 'auth', function($http, auth){
		var factory = {
			users: [],
			friends: [],
			friendRequests: []
		};

		factory.getUsers = function(){
			return $http.get('/api/users', {
				headers: {Authorization: 'Bearer '+auth.getToken()}
			}).success(function(data){
				angular.copy(data, factory.users);
			});
		}

		factory.getFriends = function(){
			return $http.get('/api/user/friends', {
				headers: {Authorization: 'Bearer '+auth.getToken()}
			}).success(function(data){
				angular.copy(data, factory.friends);
			});
		}

		factory.getFriendRequests = function(){
			return $http.get('/api/user/friend-requests', {
				headers: {Authorization: 'Bearer '+auth.getToken()}
			}).success(function(data){
				angular.copy(data, factory.friendRequests);
			});
		}

		factory.sendFriendRequest = function(userId) {
			request = {
				userId: userId 
			}
			return $http.post('/api/users/send-friend-request', request, {
				headers: {Authorization: 'Bearer '+auth.getToken()}
			})
		}

		factory.acceptFriendRequest = function(userId){
			request = {
				userId: userId
			}
			return $http.post('/api/users/accept-friend-request', request, {
				headers: {Authorization: 'Bearer '+auth.getToken()}
			})
		}

		factory.deleteFriend = function(friendId){
			request = {
				friendId: friendId
			}
			return $http.post('/api/users/delete-friend', request, {
				headers: {Authorization: 'Bearer '+auth.getToken()}
			})
		}

		return factory;
}])