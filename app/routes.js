var passport = require('passport'),
  	mongoose = require('mongoose'),
	  User = mongoose.model('User'),
    Flavor = mongoose.model('Flavor'),
    Comment = mongoose.model('Comment'),
	  jwt = require('express-jwt'),
    aws = require('aws-sdk');

var path = process.cwd();

/*
 * Load the S3 information from the environment variables.
 */
var AWS_ACCESS_KEY = process.env.AWS_ACCESS_KEY;
var AWS_SECRET_KEY = process.env.AWS_SECRET_KEY;
var S3_BUCKET = process.env.S3_BUCKET;

// Add to any route that requires authentication
var auth = jwt({secret: process.env.SECRET, userProperty: 'payload'});

module.exports = function(app) {

    // ******* SERVER ROUTES *******

/***************************** authentication routes ****************************************/
    app.post('/register', function(req, res, next){
      if(!req.body.username || !req.body.password){
        return res.status(400).json({message: 'Please fill out all fields'});
      }

      var user = new User();

      user.username = req.body.username;

      user.setPassword(req.body.password)

      user.save(function (err){
        if(err){ return next(err); }

        return res.json({token: user.generateJWT()})
      });
    });

    app.post('/login', function(req, res, next){
      if(!req.body.username || !req.body.password){
        return res.status(400).json({message: 'Please fill out all fields'});
      }

      passport.authenticate('local', function(err, user, info){
        if(err){ return next(err); }

        if(user){
          return res.json({token: user.generateJWT()});
        } else {
          return res.status(401).json(info);
        }
      })(req, res, next);
    });


/***************************** Users ****************************************/

    // Retrieve current user
    app.get('/api/current-user', auth, function(req, res, next){
      var currentUserId = req.payload._id;
      User.findOne({"_id": currentUserId},{"hash": 0, "salt": 0, "__v": 0}, function(err, user){
          if(err){ return next(err); }

          res.json(user);
      })
    });


    // Retrieve all users except current. Used to add friendships. OR retrieve specific user
    app.get('/api/users/:userId?', auth, function(req, res, next){
      var currentUserId = req.payload._id;
      var user = req.params.userId;
      if(user === undefined) {

        User.find({"_id": { $ne: currentUserId }},{"hash": 0, "salt": 0}, function(err, users){
          if(err){ return next(err); }

          res.json(users);
        })
      } else {
        User.find({"_id": user},{"hash": 0, "salt": 0, "pendingRequests": 0, "requestsSend": 0, "flavors": 0}, function(err, user){
          if(err){ return next(err); }

          res.json(user);
        })
      }
    })

    // Retrieve user's friends
    app.get('/api/user/friends/:userId?', auth, function(req, res, next){
      var currentUserId = req.payload._id;
      var user = req.params.userId;
      if(user === undefined) {
        User.findOne({"_id": currentUserId },{"hash": 0, "salt": 0, "requestsSend": 0, "_id":0, "username": 0, "__v": 0, "pendingRequests": 0})
          .populate("friends", "_id username profilepicture")
          .exec(function(err, user){
            if(err){ return next(err); }

            res.json(user.friends);
        })
      } else {
        User.findOne({"_id": user },{"hash": 0, "salt": 0, "requestsSend": 0, "_id":0, "username": 0, "__v": 0, "pendingRequests": 0})
          .populate("friends", "_id username profilepicture")
          .exec(function(err, user){
            if(err){ return next(err); }

            res.json(user.friends);
        })
      }
    })

    // Retrieve current user's friend requests
    app.get('/api/user/friend-requests', auth, function(req, res, next){
      var currentUserId = req.payload._id;
      User.findOne({"_id": currentUserId },{"hash": 0, "salt": 0, "requestsSend": 0, "_id":0, "username": 0, "__v": 0, "friends": 0})
      .populate("pendingRequests", "_id username profilepicture")
      .exec(function(err, user){
        if(err){ return next(err); }

        res.json(user.pendingRequests);
      })
    })


    // Send a friend request
    app.post('/api/users/send-friend-request', auth, function(req, res, next){
      var currentUserId = req.payload._id;
      console.log(currentUserId);
      var userId = req.body.userId;
    
      // find friend and add currentUser to pendingRequests
      User
       .findOne({"_id": userId, "pendingRequests": { $ne: currentUserId }}, function(err, user){
         if(err) { res.error(err) };
         user.pendingRequests.push(mongoose.Types.ObjectId(currentUserId));
         user.save();
       })

      // find currentUser and add friend to requestsSend
      User
       .findOne({"_id": currentUserId, "requestsSend": { $ne: userId }}, function(err, user){
         if(err) { res.error(err) };
         user.requestsSend.push(mongoose.Types.ObjectId(userId));
         user.save();
       })
    });


    // Accept friend request
    app.post('/api/users/accept-friend-request', auth, function(req, res, next){
      var currentUserId = req.payload._id;
      var userId = req.body.userId;
      console.log(userId);
      // find friend and add currentUser to friends and remove it from requestsSend
      User
       .findOne({"_id": userId, "friends": { $ne: currentUserId }, "requestsSend": currentUserId }, function(err, user){
         if(err) { res.error(err) };
         user.friends.push(mongoose.Types.ObjectId(currentUserId));
         user.requestsSend.pull(currentUserId)
         user.save();
       })
      
      // find currentUser and add friend to friends and remove it from pendindRequests
      User
       .findOne({"_id": currentUserId, "friends": { $ne: userId }, "pendingRequests": userId }, function(err, user){
        if(err) { res.error(err) };
          user.friends.push(mongoose.Types.ObjectId(userId));
          user.pendingRequests.pull(userId)
          user.save();
       })
    });

    // Cancel send friend request
    app.post('/api/users/cancel-friend-request', auth, function(req, res, next){
      var currentUserId = req.payload._id;
      var userId = req.body.userId;
    
      // find friend and remove currentUser from pendingRequests
      User
       .findOne({"_id": userId, "pendingRequests": currentUserId}, function(err, user){
         if(err) { res.error(err) };
         user.pendingRequests.pull(currentUserId)
         user.save();
       })
      
      // find currentUser and remove friend from requestsSend
      User
       .findOne({"_id": currentUserId, "requestsSend": userId}, function(err, user){
        if(err) { res.error(err) };
          user.requestsSend.pull(userId)
          user.save();
       })
    });

    // Delete a friend
    app.post('/api/users/delete-friend', auth, function(req, res, next){
      var currentUserId = req.payload._id;
      var friendId = req.body.friendId;
    
      // find friend and add currentUser to pendingRequests
      User
       .findOne({"_id": friendId, "friends": currentUserId }, function(err, user){
         if(err) { res.error(err) };
         user.friends.pull(currentUserId);
         user.save();
       })

      // find currentUser and add friend to requestsSend
      User
       .findOne({"_id": currentUserId, "friends": friendId }, function(err, user){
         if(err) { res.error(err) };
         user.friends.pull(friendId);
         user.save();
       })
    });

    // save profile pic
    app.post('/api/user/save-profile-pic', auth, function(req, res, next){
        var currentUserId = req.payload._id;
        var profilePic = req.body.profilePic;

       User
        .findOne({"_id": currentUserId}, function(err, user){
           if(err) { res.error(err) };
           user.profilepicture = profilePic;
           user.save();
         })
    });


/***************************** Flavors ****************************************/
    // Retrieve user's flavors
    app.get('/api/flavors/user/:userId', function(req, res, next){
      var posts = req.query.posts;
      var user = req.params.userId;
      if(posts === 'true'){
        query = {
          user: user
        }
      } else {
        query = {
          user: user,
          post: posts
        }
      }

      Flavor.find(query)
        .populate("user", "_id username profilepicture")
        .populate({path: "comments", populate: { path: "user", select: "_id profilepicture username" }}) //, options: { limit: 3, sort: {_id: -1} }
        .exec(function(err, flavors){
          if(err){ return next(err); }

          res.json(flavors);
      });
    })

    // Retrieve all user's friends flavors
    app.get('/api/home/flavors/user/:user', function(req, res, next){
      var users = req.user.friends;
      users.push(req.user._id);
      Flavor.find( {"user": { $in: users }})
        .populate("user", "_id username profilepicture")
        .populate({path: "comments", populate: { path: "user", select: "_id profilepicture username" }}) //, options: { limit: 3, sort: {_id: -1} }
        .exec(function(err, flavors){
          if(err){ return next(err); }
          res.json(flavors);
      })
    })




    // Create new flavor
    app.post('/api/:user/flavors', auth, function(req, res, next){
      var flavor = new Flavor(req.body);
      flavor.user = req.user;
      flavor.save(function(err, flavor){
        if(err){ return next(err); }
        
        req.user.flavors.push(flavor);
        req.user.save();
        res.json(flavor);
      });
    });

    // Retrieve flavor
    app.get('/api/flavors/:flavor', function(req, res){
      var flavor = req.flavor._id;
      Comment.find({flavor: flavor})
        .populate("user", "_id username profilepicture")
        .exec(function(err, comments){
          if(err){ return next(err); }
          req.flavor.comments = comments;

          res.json(req.flavor);
      });
    });

    // Upvote flavor
    app.put('/api/flavors/:flavor/upvote', auth, function(req, res, next){

      upvotedBy = req.payload.username;
      upvotedByIndex = req.flavor.upvotesBy.indexOf(upvotedBy);
      if( upvotedByIndex === -1){
        req.flavor.upvote(upvotedBy, function(err, flavor){
          if(err){ return next(err); }

          res.json(flavor);
        });
      } else {
        req.flavor.downvote(upvotedByIndex, function(err, flavor){
          if(err){ return next(err); }

          res.json(flavor);
        });
      }

    });

    // Post new comment
    app.post('/api/:user/flavors/:flavor/comments', auth, function(req, res, next){
      var comment = new Comment(req.body);
      comment.flavor = req.flavor._id;
      comment.user = req.user;

      comment.save(function(err, comment){
        if(err){ return next(err); }

        req.flavor.comments.push(comment);
        req.flavor.save(function(err, flavor){
          if(err){ return next(err); }

          res.json(comment);
        });
      });
    });


    // Upvote comment
    app.put('/api/flavors/:flavor/comments/:comment/upvote', auth, function(req, res, next){

      upvotedBy = req.payload.username;
      upvotedByIndex = req.comment.upvotesBy.indexOf(upvotedBy);
      if( upvotedByIndex === -1){
        req.comment.upvote(upvotedBy, function(err, comment){
          if(err){ return next(err); }

          res.json(comment);
        });
      } else {
        req.comment.downvote(upvotedByIndex, function(err, comment){
          if(err){ return next(err); }

          res.json(comment);
        });
      }
    });


/***************************** Param() ****************************************/

    // Use Express's param() function to automatically load an object
    
    // for routes that have :flavor as a param
    app.param('flavor', function(req, res, next, id){
      var query = Flavor.findById(id);

      query.exec(function(err, flavor){
        if (err) { return next(err); }
        if(!flavor) { return next(new Error('can\'t find flavor')); }

        req.flavor = flavor;
        return next();
      })
    })

    // for routes that have :comment as a param
    app.param('comment', function(req, res, next, id){
      var query = Comment.findById(id);

      query.exec(function(err, comment){
        if(err) { return next(err); }
        if(!comment) { return next(new Error('can\'t find comment')); }

        req.comment = comment;
        return next();
      })
    })

    app.param('user', function(req, res, next, id){
      var query = User.findById(id,{"profilepicture": 1, "username": 1, "flavors": 1, "friends": 1});

      query.exec(function(err, user){
        if(err) { return next(err); }
        if(!user) { return next(new Error('can\'t find user')); }

        req.user = user;
        return next();
      })
    })

/***************************** Amazon S3 ****************************************/

    /*
     * Respond to GET requests to /sign_s3.
     * Upon request, return JSON containing the temporarily-signed S3 request and the
     * anticipated URL of the image.
     */
    app.get('/sign_s3', function(req, res){
        aws.config.update({accessKeyId: AWS_ACCESS_KEY , secretAccessKey: AWS_SECRET_KEY });
        var s3 = new aws.S3(); 
        var s3_params = { 
            Bucket: S3_BUCKET, 
            Key: req.query.file_name, 
            Expires: 60, 
            ContentType: req.query.file_type, 
            ACL: 'public-read'
        }; 
        s3.getSignedUrl('putObject', s3_params, function(err, data){ 
            if(err){ 
                console.log(err); 
            }
            else{ 
                var return_data = {
                    signed_request: data,
                    url: 'https://'+S3_BUCKET+'.s3.amazonaws.com/'+req.query.file_name 
                };
                res.write(JSON.stringify(return_data));
                res.end();
            } 
        });
    });




    // ******* FRONTEND ROUTES *******
    // route to handle all angular requests
    app.get('/', function(req, res) {
        res.sendFile(process.cwd() + '/public/views/index.html'); // load our public/index.html file
    });

};