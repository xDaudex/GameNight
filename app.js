require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");

const app = express();

app.use(express.static("public"));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
    secret: "Our little secret.",
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect("mongodb://localhost:27017/userDB");
mongoose.set("useCreateIndex", true);

const userSchema = new mongoose.Schema ({
    username: String,
    name: String,
    password: String,
    isAdmin: Boolean
});

userSchema.plugin(passportLocalMongoose);

const User = new mongoose.model("User", userSchema);

const votingStatusSchema = new mongoose.Schema ({
    isOpen: Boolean,
    dateChanged: Date,
    dateOpened: Date,
    dateClosed: Date
});

const Votingstatus = new mongoose.model("Votingstatus", votingStatusSchema);

const gameSchema = new mongoose.Schema ({
    name: String,
    isEnabled: Boolean
});

const Game = new mongoose.model("Game", gameSchema);

const voteSchema = new mongoose.Schema ({
    voteDate: Date,
    gameId: {type: mongoose.Schema.Types.ObjectId, ref: Game},
    userId: {type: mongoose.Schema.Types.ObjectId, ref: User}
});

const Vote = new mongoose.model("Vote", voteSchema);

passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

var currentResponse = "";

app.get("/", function(req, res) {
    res.render("home");
});

app.get("/login", function(req, res) {
    res.render("login");
});

app.post("/login", function(req, res) {
    const user = new User({
        username: req.body.username,
        password: req.body.password
    });

    req.login(user, function(err) {
        if (!err) {
            passport.authenticate("local")(req, res, function() {
                res.redirect("/menu");
            });
        } else {
            console.log(err);
        }
    });
});

app.get("/register", function(req, res) {
    res.render("register");
});

app.post("/register", function(req, res) {
    User.register({username: req.body.username, name: req.body.name, isAdmin: false}, req.body.password, function(err, user) {
        if (!err) {
            passport.authenticate("local")(req, res, function() {
                res.redirect("/menu");
            });
        } else {
            console.log(err);
            res.redirect("/register");
        }
    })
});

app.get("/menu", function(req, res) {
    if (req.isAuthenticated()) {
        User.findOne({username: req.user.username}, function(err, userData) {
            res.render("menu", {User: req.user.username, isAdmin: userData.isAdmin, response: currentResponse});
        });
    } else {
        res.redirect("/login");
    }
});

app.get("/logout", function(req, res) {
    req.logout();
    res.redirect("/");
});

app.post("/openVoting", function(req, res) {
    Votingstatus.updateOne({}, {isOpen: true, dateChanged: Date(), dateOpened: Date()}, function(err, status) {
        if (err) {
            console.log(err);
        }

        currentResponse = "Voting is now open!";
        res.redirect("/menu");
    });
});

app.post("/closeVoting", function(req, res) {
    Votingstatus.updateOne({}, {isOpen: false, dateChanged: Date(), dateClosed: Date()}, function(err, status) {
        if (err) {
            console.log(err);
        }

        currentResponse = "Voting is now closed!";
        res.redirect("/menu");
    });
});

app.get("/votingSelection", function(req, res) {
    if (req.isAuthenticated()) {
        User.findOne({username: req.user.username}, function(err, userData) {
            if (userData.isAdmin) {
                Game.find({}, null, {sort: {name: 1}}, function(err, foundGames) {
                    res.render("changeVoting", {gamesList: foundGames});
                });
            } else {
                res.redirect("/menu");
            }
        });
    } else {
        res.redirect("/login");
    }
});

app.get("/vote", function(req, res) {
    if (req.isAuthenticated()) {
        User.findOne({username: req.user.username}, function(err, foundUser) {
            Vote.findOne({userId: foundUser._id}, null, {sort: {voteDate: -1}}, function(err, foundVote) {
                Votingstatus.findOne({}, function(err, foundStatus) {
                    if (foundVote.voteDate < foundStatus.dateOpened) {
                        if (foundStatus.isOpen) {
                            Game.find({isEnabled: true}, null, {sort: {name: 1}}, function(err, foundGames) {
                                res.render("vote", {gamesList: foundGames});
                            });
                        } else {
                            res.redirect("/menu");
                        }
                    } else {
                        res.redirect("/menu");
                    }
                });
            });
        });
    } else {
        res.redirect("/login");
    }
});

app.post("/changeEnabled", function(req, res) {
    var changedName = "";
    var checked = false;
    if (req.body.checkbox[0].length > 1) {
        changedName = req.body.checkbox[0];
        checked = true;
    } else {
        changedName = req.body.checkbox
        checked = false;
    }

    Game.updateOne({name: changedName}, {isEnabled: checked}, function(err, foundGames) {
        if (err) {
            console.log(err);
        }
    });
    res.redirect("/votingSelection");
});

app.post("/submitVote", function(req, res) {
    if (typeof req.body.checkbox != "undefined") {
        if (req.body.checkbox[0].length > 1) {
            if (req.body.checkbox.length === 2) {
                for(i = 0; i < req.body.checkbox.length; i++) {
                    Game.findOne({name: req.body.checkbox[i]}, function(err, foundGame) {
                        if (!err) {
                            User.findOne({username: req.user.username}, function(err, foundUser) {
                                if(!err) {
                                    Vote.insertMany({gameId: foundGame.id, userId: foundUser, voteDate: Date()}, function(err) {
                                        if (err) {
                                            console.log(err);
                                        }
                                    });
                                } else {
                                    console.log(err);
                                }
                            });
                        } else {
                            console.log(err);
                        }
                    });
                }

                res.redirect("/menu");
            } else {
                res.redirect("/vote");
            }
        } else {
            res.redirect("/vote");
        }
    } else {
        res.redirect("/vote");
    }
});

app.listen(3000, function() {
    console.log("Server started on port 3000.");
});
