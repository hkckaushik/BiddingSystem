var path = require('path');
var async = require('async');
var bcrypt = require('bcryptjs');
var bodyParser = require('body-parser');
var cors = require('cors');
var express = require('express');
var compression = require('compression');
var logger = require('morgan');
var jwt = require('jwt-simple');
var moment = require('moment');
var mongoose = require('mongoose');
var request = require('request');
var dateFormat = require('dateformat');
var nodemailer = require('nodemailer');
//var mc = require('mc');
var Memcached = require('memcached');

var memcached = new Memcached('localhost:11211');

var smtpTransport = nodemailer.createTransport({
    service: "Gmail",
    auth: {
        user: "virtualclass.node@gmail.com",
        pass: "angularjs"
    }
});
var https = require('https');
const fs = require('fs');

var config = require('./config');

var options = {
    key: fs.readFileSync('./ssl/privatekey.key'),
    cert: fs.readFileSync('./ssl/certificate.crt')
};

var userSchema = new mongoose.Schema({
    email: {type: String, unique: true, lowercase: true},
    password: {type: String, select: false},
    displayName: String,
    picture: String,
    facebook: String,
    google: String,
    lastLoggedTimes: [String],
    lastloggedLocations: [mongoose.Schema.Types.Mixed],
    cart: {type: [mongoose.Schema.Types.Mixed], default: []}
});

var itemSchema = new mongoose.Schema({
    userId: String,
    title: String,
    description: String,
    quantity: Number,
    price: Number,
    bids: [String],
    createdAt: Date,
    isActive: {type: Boolean, default: true}
});

var bidSchema = new mongoose.Schema({
    userId: String,
    itemId: String,
    description: String,
    quantity: Number,
    price: Number,
    createdAt: Date
});


var checkoutSchema = new mongoose.Schema({
    posterId: String,
    bidderId: String,
    postId: String,
    quantity: Number,
    list: [mongoose.Schema.Types.Mixed],
    total_amount: Number
});


userSchema.pre('save', function (next) {
    var user = this;
    if (!user.isModified('password')) {
        return next();
    }
    bcrypt.genSalt(10, function (err, salt) {
        bcrypt.hash(user.password, salt, function (err, hash) {
            user.password = hash;
            next();
        });
    });
});

userSchema.methods.comparePassword = function (password, done) {
    bcrypt.compare(password, this.password, function (err, isMatch) {
        done(err, isMatch);
    });
};

var User = mongoose.model('User', userSchema);
var Item = mongoose.model('Item', itemSchema);
var Bid = mongoose.model('Bid', bidSchema);
var Checkout = mongoose.model('Checkout', checkoutSchema);

mongoose.connect(config.MONGO_URI);
mongoose.connection.on('error', function (err) {
    console.log('Error: Could not connect to MongoDB. Did you forget to run `mongod`?'.red);
});
mongoose.set('debug', true);

var app = express();

app.use(compression(
    {
        threshold: 0,
        filter: function (req, res) {
            return true;
        }
    })
);
app.set('port', process.env.NODE_PORT || 3000);
app.set('host', process.env.NODE_IP || 'localhost');
app.use(cors());
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

// Force HTTPS on Heroku
if (app.get('env') === 'production') {
    app.use(function (req, res, next) {
        var protocol = req.get('x-forwarded-proto');
        protocol == 'https' ? next() : res.redirect('https://' + req.hostname + req.url);
    });
}
app.use(express.static(path.join(__dirname, '../../client')));

/*
 |--------------------------------------------------------------------------
 | Generate JSON Web Token
 |--------------------------------------------------------------------------
 */
function createJWT(user) {
    var payload = {
        sub: user._id,
        iat: moment().unix(),
        exp: moment().add(5, 'days').unix()
    };
    return jwt.encode(payload, config.TOKEN_SECRET);
}

var sendMail = function (sub, txt, mailId) {
    var options = {
        subject:sub,
        text:txt,
        to:mailId
    };
    smtpTransport.sendMail(options,function(err,info){
        if(err)
            return console.log(err);
        console.log("Message Sent: " + info.response);

    });
};

/*
 |--------------------------------------------------------------------------
 | Login Required Middleware
 |--------------------------------------------------------------------------
 */
function ensureAuthenticated(req, res, next) {
    if (!req.header('Authorization')) {
        return res.status(401).send({message: 'Please make sure your request has an Authorization header'});
    }
    var token = req.header('Authorization').split(' ')[1];
    var payload = null;
    try {
        payload = jwt.decode(token, config.TOKEN_SECRET);
    }
    catch (err) {
        return res.status(401).send({message: err.message});
    }

    if (payload.exp <= moment().unix()) {
        return res.status(401).send({message: 'Token has expired'});
    }
    req.user = payload.sub;
    next();
}

var memcached_Options = { flags: 0, exptime: 0};

var memcached_set = function(key,val){
    memcached.set(key,val,0,function(err){
        if(err){
            console.log("Error Adding to memcache");
        }
        else{
            console.log("Successfully added to memcache");
        }
    });
};

/*
 |--------------------------------------------------------------------------
 | Log in with Email
 |--------------------------------------------------------------------------
 */
app.post('/auth/login', function (req, res) {
    User.findOne({email: req.body.email}, '+password', function (err, user) {
        if (!user) {
            return res.status(401).send({message: 'Invalid email and/or password'});
        }
        user.comparePassword(req.body.password, function (err, isMatch) {
            if (!isMatch) {
                return res.status(401).send({message: 'Invalid email and/or password'});
            }
            // var now = new Date();
            user.lastloggedLocations.push(req.body.locationInfo);
            // user.lastLoggedTimes.push(dateFormat(now, "dddd, mmmm dS, yyyy, h:MM:ss TT"));
            user.lastLoggedTimes.push(new Date());
            user.save(function (err) {
                memcached_set(user._id.toString(),user._doc);
                res.send({token: createJWT(user)});
            });

        });
    });
});

/*
 |--------------------------------------------------------------------------
 | Create Email and Password Account
 |--------------------------------------------------------------------------
 */
app.post('/auth/signup', function (req, res) {
    User.findOne({email: req.body.email}, function (err, existingUser) {
        if (existingUser) {
            return res.status(409).send({message: 'Email is already taken'});
        }
        var user = new User({
            displayName: req.body.displayName,
            email: req.body.email,
            password: req.body.password
        });
        user.lastLoggedTimes.push(new Date());
        user.lastloggedLocations.push(req.body.locationInfo);
        user.save(function (err, result) {
            if (err) {
                res.status(500).send({message: err.message});
            }
            // memcached_set(user._id.toString(),user._doc);
            res.send({token: createJWT(result)});
        });
    });
});

/*
 |--------------------------------------------------------------------------
 | Login with Google
 |--------------------------------------------------------------------------
 */
app.post('/auth/google', function (req, res) {
    var accessTokenUrl = 'https://accounts.google.com/o/oauth2/token';
    var peopleApiUrl = 'https://www.googleapis.com/plus/v1/people/me/openIdConnect';
    var params = {
        code: req.body.code,
        client_id: req.body.clientId,
        client_secret: config.GOOGLE_SECRET,
        redirect_uri: req.body.redirectUri,
        grant_type: 'authorization_code'
    };

    // Step 1. Exchange authorization code for access token.
    request.post(accessTokenUrl, {json: true, form: params}, function (err, response, token) {
        var accessToken = token.access_token;
        var headers = {Authorization: 'Bearer ' + accessToken};

        // Step 2. Retrieve profile information about the current user.
        request.get({url: peopleApiUrl, headers: headers, json: true}, function (err, response, profile) {
            if (profile.error) {
                return res.status(500).send({message: profile.error.message});
            }
            // Step 3a. Link user accounts.
            if (req.header('Authorization')) {
                User.findOne({google: profile.sub}, function (err, existingUser) {
                    if (existingUser) {
                        return res.status(409).send({message: 'There is already a Google account that belongs to you'});
                    }
                    var token = req.header('Authorization').split(' ')[1];
                    var payload = jwt.decode(token, config.TOKEN_SECRET);
                    User.findById(payload.sub, function (err, user) {
                        if (!user) {
                            return res.status(400).send({message: 'User not found'});
                        }
                        user.email = profile.email;
                        user.google = profile.sub;
                        user.picture = user.picture || profile.picture.replace('sz=50', 'sz=200');
                        user.displayName = user.displayName || profile.name;
                        user.lastloggedLocations.push(req.body.locationInfo);
                        user.lastLoggedTimes.push(Date());
                        user.save(function () {
                            var token = createJWT(user);
                            return res.send({token: token});
                        });
                    });
                });
            } else {
                User.findOne({email: profile.email}, function (err, user) {
                     if (user) {
                        if (user.google == undefined) {
                            return res.status(400).send({message: 'Email associated with that google profile exists already'});
                        }
                        else if (user.google == profile.sub) {
                            user.lastloggedLocations.push(req.body.locationInfo);
                            user.lastLoggedTimes.push(Date());
                            user.save(function(){
                                //memcached_set(user._id.toString(),user._doc);
                            });
                            return res.send({token: createJWT(user)});
                        }
                    }
                    var newuser = new User();
                    newuser.email = profile.email;
                    newuser.google = profile.sub;
                    newuser.picture = profile.picture.replace('sz=50', 'sz=200');
                    newuser.displayName = profile.name;
                    newuser.lastloggedLocations.push(req.body.locationInfo);
                    newuser.lastLoggedTimes.push(Date());
                    newuser.save(function () {
                        var token = createJWT(newuser);
                        //memcached_set(newuser._id.toString(),newuser._doc);
                        return res.send({token: token});
                    });

                });
            }
        });
    });
});

/*
 |--------------------------------------------------------------------------
 | Login with Facebook
 |--------------------------------------------------------------------------
 */
app.post('/auth/facebook', function (req, res) {
    var fields = ['id', 'email', 'first_name', 'last_name', 'link', 'name'];
    var accessTokenUrl = 'https://graph.facebook.com/v2.5/oauth/access_token';
    var graphApiUrl = 'https://graph.facebook.com/v2.5/me?fields=' + fields.join(',');
    var params = {
        code: req.body.code,
        client_id: req.body.clientId,
        client_secret: config.FACEBOOK_SECRET,
        redirect_uri: req.body.redirectUri
    };

    // Step 1. Exchange authorization code for access token.
    request.get({url: accessTokenUrl, qs: params, json: true}, function (err, response, accessToken) {
        if (response.statusCode !== 200) {
            return res.status(500).send({message: accessToken.error.message});
        }

        // Step 2. Retrieve profile information about the current user.
        request.get({url: graphApiUrl, qs: accessToken, json: true}, function (err, response, profile) {
            if (response.statusCode !== 200) {
                return res.status(500).send({message: profile.error.message});
            }
            if (req.header('Authorization')) {
                User.findOne({facebook: profile.id}, function (err, existingUser) {
                    if (existingUser) {
                        return res.status(409).send({message: 'There is already a Facebook account that belongs to you'});
                    }
                    var token = req.header('Authorization').split(' ')[1];
                    var payload = jwt.decode(token, config.TOKEN_SECRET);
                    User.findById(payload.sub, function (err, user) {
                        if (!user) {
                            return res.status(400).send({message: 'User not found'});
                        }
                        user.email = profile.email;
                        user.facebook = profile.id;
                        user.picture = user.picture || 'https://graph.facebook.com/v2.3/' + profile.id + '/picture?type=large';
                        user.displayName = user.displayName || profile.name;
                        user.lastloggedLocations.push(req.body.locationInfo);
                        user.lastLoggedTimes.push(Date());
                        user.save(function () {
                            var token = createJWT(user);
                            //memcached_set(user._id.toString(),user._doc);
                            res.send({token: token});
                        });
                    });
                });
            } else {
                User.findOne({email: profile.email}, function (err, existingUser) {
                    if (existingUser) {
                        if (existingUser.facebook == undefined) {
                            return res.status(400).send({message: 'Email associated with that facebook profile exists already'});
                        }
                        else {
                            existingUser.lastloggedLocations.push(req.body.locationInfo);
                            existingUser.lastLoggedTimes.push(Date());
                            existingUser.save(function () {
                                var token = createJWT(existingUser);
                                //memcached_set(user._id.toString(),user._doc);
                                return res.send({token: token});
                            });

                        }
                    }
                    var user = new User();
                    user.facebook = profile.id;
                    user.picture = 'https://graph.facebook.com/' + profile.id + '/picture?type=large';
                    user.displayName = profile.name;
                    user.email = profile.email;
                    user.lastloggedLocations.push(req.body.locationInfo);
                    user.lastLoggedTimes.push(Date());
                    user.save(function () {
                        var token = createJWT(user);
                        //memcached_set(user._id.toString(),user._doc);
                        res.send({token: token});
                    });
                });
            }
        });
    });
});

/*
 |--------------------------------------------------------------------------
 | GET /api/me
 |--------------------------------------------------------------------------
 */
app.get('/api/me', ensureAuthenticated, function (req, res) {
    memcached.get(req.user,function (err,data) {
        if(err || data == undefined){
            console.log('Cache Miss');
            User.findById(req.user, function (err, user) {
                memcached_set(user._id.toString(),user._doc);
                res.send(user);
            });
        }
        else{
            console.log('Cache Hit');
            res.send(data);
        }
    });

});

/*
 |--------------------------------------------------------------------------
 | PUT /api/me
 |--------------------------------------------------------------------------
 */
app.post('/api/me', ensureAuthenticated, function (req, res) {
    User.findById(req.user, function (err, user) {
        if (!user) {
            return res.status(400).send({message: 'User not found'});
        }
        user.displayName = req.body.displayName || user.displayName;
        user.email = req.body.email || user.email;
        user.save(function (err) {
            memcached_set(user._id.toString(),user._doc);
            res.status(200).end();
        });
    });
});

/*
 |--------------------------------------------------------------------------
 | GET /api/prevloginInfo
 |--------------------------------------------------------------------------
 */
app.get('/api/prevloginInfo', ensureAuthenticated, function (req, res) {
    memcached.get(req.user,function(err,data){
        if(err || data == undefined){
            console.log('Cache Miss');
            User.findOne({"_id": req.user}, function (err, user) {
                if (!user) {
                    return res.status(400).send({message: 'User not found'});
                }
                var returnInfo = {};
                var locationInfo = user.lastloggedLocations;
                var timeInfo = user.lastLoggedTimes;
                if (locationInfo.length > 1 && timeInfo.length > 1) {
                    returnInfo.lastLocation = locationInfo[locationInfo.length - 2];
                    returnInfo.lastLoggedTime = dateFormat(timeInfo[timeInfo.length - 2], "dddd, mmmm dS, yyyy, h:MM:ss TT");
                }
                res.send(returnInfo);
            });
        }
        else{
            console.log('Cache Hit');
            var returnInfo = {};
            var locationInfo = data.lastloggedLocations;
            var timeInfo = data.lastLoggedTimes;
            if (locationInfo.length > 1 && timeInfo.length > 1) {
                returnInfo.lastLocation = locationInfo[locationInfo.length - 2];
                returnInfo.lastLoggedTime = dateFormat(timeInfo[timeInfo.length - 2], "dddd, mmmm dS, yyyy, h:MM:ss TT");
            }
            res.send(returnInfo);
        }
    });
});

/*
 |--------------------------------------------------------------------------
 | POST /api/post
 |--------------------------------------------------------------------------
 */
app.post('/api/post', ensureAuthenticated, function (req, res) {
    var item = new Item({
        title: req.body.title,
        description: req.body.description,
        quantity: req.body.quantity,
        price: req.body.price,
        createdAt: new Date(),
        bids: [],
        userId: req.user
    });
    item.save(function (err, result) {
        if (err) {
            res.status(500).send({message: err.message});
        }
        res.status(200).end();
    });
});

/*
 |--------------------------------------------------------------------------
 | GET /api/post
 |--------------------------------------------------------------------------
 */
app.get('/api/post', ensureAuthenticated, function (req, res) {

    Item.find({"userId": {$ne: req.user}}, function (err, posts) {
        if (!posts || err) {
            return res.status(400).send({message: 'Post not found'});
        }
        var postsObj = [];
        var j=0;
        for(var i=0;i<posts.length;i++){
            var query = User.findOne({"_id":posts[i].userId});
            var promise = query.exec();
            promise.then(function(user){
                var currPost = posts[j]._doc;
                currPost.displayName = user._doc.displayName;
                postsObj.push(currPost);
                j++;
                if(j === posts.length)
                    res.send(postsObj);

            });
        }
    });
});

/*
 |--------------------------------------------------------------------------
 | GET /api/myposts
 |--------------------------------------------------------------------------
 */
app.get('/api/myposts', ensureAuthenticated, function (req, res) {

    Item.find({userId: req.user}, function (err, posts) {
        if (!posts || err) {
            return res.status(400).send({message: 'Post not found'});
        }
        var postsObj = [];
        var j=0;
        for(var i=0;i<posts.length;i++){
            var query = User.findOne({"_id":posts[i].userId});
            var promise = query.exec();
            promise.then(function(user){
                var currPost = posts[j]._doc;
                currPost.displayName = user._doc.displayName;
                postsObj.push(currPost);
                j++;
                if(j === posts.length)
                    res.send(postsObj);

            });
        }
    });
});

/*
 |--------------------------------------------------------------------------
 | GET /api/post/:id
 |--------------------------------------------------------------------------
 */
app.get('/api/post/:id', ensureAuthenticated, function (req, res) {
    memcached.get(req.params.id,function(err,data){
        if(err || data == undefined){
            console.log('Cache Miss');
            Item.findOne({"_id": req.params.id}, function (err, post) {
                if (!post) {
                    return res.status(400).send({message: 'Post not found'});
                }
                res.send(post);
            });
        }
        else{
            console.log('Cache Hit');
            res.send(data);
        }
    });
});

/*
 |--------------------------------------------------------------------------
 | POST /api/bid
 |--------------------------------------------------------------------------
 */
app.post('/api/:postId/bid', ensureAuthenticated, function (req, res) {
    if (req.params.postId) {
        var bid = new Bid({
            userId: req.user,
            itemId: req.params.postId,
            description: req.body.additionalDesc,
            quantity: req.body.quantity,
            price: req.body.bidPrice,
            createdAt: new Date()
        });
        bid.save(function (err, result) {
            if (err) {
                res.status(500).send({message: err.message});
            }
            memcached_set(result._id.toString(),result._doc);
            Item.findOne({_id: req.params.postId}, function (err, post) {
                if (err)
                    res.status(500).send({message: err.message});
                post.bids.push(result._id);
                post.save(function (err, result) {
                    if (err)
                        res.status(500).send({message: err.message});
                    memcached_set(result._id.toString(),result._doc);
                    res.status(200).end();
                });
            });
        });
    }
    else {
        res.status(500).send({message: "Invalid Information"});
    }
});

/*
 |--------------------------------------------------------------------------
 | GET /api/post/:id
 |--------------------------------------------------------------------------
 */
app.get('/api/bids/:postId', ensureAuthenticated, function (req, res) {
    Bid.find({itemId: req.params.postId}, function (err, bids) {
        if (!bids || err) {
            return res.status(400).send({message: 'Post not found'});
        }
        var bidsObj = [];
        var j=0;
        for(var i=0;i<bids.length;i++){

            var query = User.findOne({"_id":bids[i].userId});
            var promise = query.exec();
            promise.then(function(user){
                // var currBid = bids[i]._doc;
                var currBid = bids[j]._doc;
                currBid.displayName = user._doc.displayName;
                bidsObj.push(currBid);
                j++;
                if(j === bids.length)
                    res.send(bidsObj);

            });

        }
    });
});

/*
 |--------------------------------------------------------------------------
 | GET /api/post/:id
 |--------------------------------------------------------------------------
 */
app.get('/api/isMyPost/:postId', ensureAuthenticated, function (req, res) {
    memcached.get(req.params.postId,function(err,data){
        if(err || data == undefined){
            console.log('Cache Miss');
            Item.findOne({_id: req.params.postId}, function (err, post) {
                memcached_set(post._id.toString(),post._doc);
                if (!post || err) {
                    return res.status(400).send({message: 'Post not found'});
                }
                if (post.userId === req.user)
                    res.send({isMyPost: true});
                else
                    res.send({isMyPost: false});
            });
        }
        else{
            console.log('Cache Hit');
            if (data.userId === req.user)
                res.send({isMyPost: true});
            else
                res.send({isMyPost: false});
        }
    });

});

/*
 |--------------------------------------------------------------------------
 | GET /api/post/:id
 |--------------------------------------------------------------------------
 */
app.get('/api/mybids', ensureAuthenticated, function (req, res) {
    Bid.find({"userId": req.user}, function (err, bids) {
        if (!bids || err) {
            return res.status(400).send({message: 'Post not found'});
        }
        res.send(bids);
    });
});

/*
 |--------------------------------------------------------------------------
 | GET /api/post/:id
 |--------------------------------------------------------------------------
 */
app.get('/api/bid/:id', ensureAuthenticated, function (req, res) {
    memcached.get(req.params.id,function(err,data){
        if(err || data == undefined){
            console.log('Cache Miss');
            Bid.findOne({"_id": req.params.id}, function (err, bid) {
                if (!bid) {
                    return res.status(400).send({message: 'Post not found'});
                }
                res.send(bid);
            });
        }
        else{
            console.log('Cache Hit');
            res.send(data);
        }
    });
});

/*
 |--------------------------------------------------------------------------
 | GET /api/post/:id
 |--------------------------------------------------------------------------
 */
app.get('/api/mybids/posts', ensureAuthenticated, function (req, res) {
    Bid.find({userId: req.user}, function (err, bids) {
        if (err) {
            res.status(500).send({message: err.message});
        }
        posts = [];
        for (var bid in bids) {
            posts.push(bids.postId);
        }
        res.status(200).send(posts);
    });
});

/*
 |--------------------------------------------------------------------------
 | GET /api/cart
 |--------------------------------------------------------------------------
 */
app.get('/api/cart', ensureAuthenticated, function (req, res) {
    memcached.get(req.user,function(err,data){
        if(err || data == undefined){
            console.log('Cache Miss');
            User.findOne({_id: req.user}, function (err, user) {
                if (err) {
                    res.status(500).send({message: err.message});
                }
                res.send({cart: user.cart});
            });
        }
        else{
            console.log('Cache Hit');
            res.send({cart: data.cart});
        }
    });

});

/*
 |--------------------------------------------------------------------------
 | POST /api/cart
 |--------------------------------------------------------------------------
 */
app.post('/api/cart', ensureAuthenticated, function (req, res) {
    User.findById(req.user, function (err, user) {
        if (err) {
            res.status(500).send({message: err.message});
        }
        user.cart = req.body.cart;
        user.save(function (err, result) {
            memcached_set(result._id.toString(),result._doc);
            if (err) {
                res.status(500).send({message: err.message});
            }
            res.status(200).send();
        });
    });
});

/*
 |--------------------------------------------------------------------------
 | POST /api/checkout
 |--------------------------------------------------------------------------
 */
app.post('/api/checkout', ensureAuthenticated, function (req, res) {
    //1. Checkout Information  -   req.body.checkoutinfo
    //2. Users Email   -  req.user->userId -> useremail
    //3. Bidders Email  -   req.body.bidderId -> bidderId -> bidder EMail
    //4. Checkout Table -  Total Amount, No of items, listofitems, posterId, BidderId , postId
    //5. Make postid inactive   -  postId->save isActive to false;

    User.findById(req.user, function (err, postUser) {
        if (err) {
            res.status(500).send({message: err.message});
        }
        var userId = req.user;
        var userEmail = postUser.email;
        var checkoutItems = req.body.items;
        for (var i = 0; i < checkoutItems.length; i++) {
            var bidderId = checkoutItems[i]._data.userId;
            var res_subject = "Order Placed";

            User.findById(bidderId, function (err, bidUser) {
                if (err)
                    res.status(500).send({message: err.message});
                var bidderEmail = bidUser.email;
                var res_text = "Your bid has been accepted";
                sendMail(res_subject, res_text, bidderEmail);
            });
            Item.findOne({_id: checkoutItems[i]._data.itemId}, function (err, item) {
                if (err)
                    res.status(500).send({message: err.message});
                if (!item.isActive) {
                    item.isActive = false;
                    item.save(function (err, result) {
                        if (err)
                            res.status(500).send({message: err.message});
                    });
                }
            });
        }
        var res_text = "Your order has been placed";
        sendMail(res_subject, res_text, userEmail);
        res.status(200).send();
    });
});

// catch the uncaught errors that weren't wrapped in a domain or try catch statement
// do not use this in modules, but only in applications, as otherwise we could have multiple of these bound
process.on('uncaughtException', function (err) {
    // handle the error safely
    console.log(err)
});

/*
 |--------------------------------------------------------------------------
 | Start the Server
 |--------------------------------------------------------------------------
 */
var server = https.createServer(options, app).listen(app.get('port'), app.get('host'), function () {
    console.log('Express server listening on port https ' + app.get('port'));
});

app.on('connection',function(socket){
    socket.setTimeout(5 * 60 * 1000);
    socket.once('timeout', function() {
        process.nextTick(socket.destroy);
    });
});