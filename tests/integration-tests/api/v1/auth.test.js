var async = require('async');
var assert = require('chai').assert;
var should = require('chai').should();
var blueprint = require('@onehilltech/blueprint');
var appPath = require('../../../fixtures/appPath');
var it = require("mocha").it;
var before = require("mocha").before;
var describe = require("mocha").describe;
var users = require('../../../fixtures/users');
var after = require("mocha").after;
var tokens = [];

describe('Auth API v1', function () {
    var server;
    var request;

    function createUser(key, done) {
        request
            .post('/api/v1/users')
            .type('json')
            .set('Accept', 'application/json')
            .send(users[key])
            .expect(201)
            .end(function(error, response) {
                if (error) {
                    return done(error);
                }
                done();
            });
    }

    function getToken(key, done) {
        request
            .post('/api/v1/auth/jwt')
            .type('json')
            .set('Accept', 'application/json')
            .send( { handle: users[key].handle, password: users[key].password } )
            .expect(200)
            .end(function (error, response) {
                if (error) {
                    return done(error);
                }

                assert(response.body.auth_token);
                tokens.push(response.body.auth_token);
                done();
            });
    }

    function getUserFromToken(key, done) {
        request
            .post('/api/v1/users/me')
            .type('json')
            .set('Accept', 'application/json')
            .send({ auth_token: tokens[key] } )
            .expect(200)
            .end(function (error, response) {
                if (error) {
                    return done(error);
                }
                assert(response.body.handle == users[key].handle);
                done();
            });
    }

    function getBadToken(key, pass, done) {
        request
            .post('/api/v1/auth/jwt')
            .type('json')
            .set('Accept', 'application/json')
            .send({ handle: users[key].handle, password: pass })
            .expect(401)
            .end(function (error, response) {
                if (error) {
                    return done(error);
                }
                assert(response.body.error);
                done();
            });
    }

    function deleteUser(key, param, done) {
        request
            .delete('/api/v1/users/' + users[key][param])
            .expect(204, done);
    }

    before(function (done) {
        async.waterfall([
            function(callback) {
                blueprint.testing.createApplicationAndStart(appPath, callback)
            },

            function(app, callback) {
                server = app.server;
                request = require('supertest')(server.app);

                return callback(null);
            }
        ], done);
    });

    it('should create a single user', function(done) {
        createUser(0, done);
    });

    it('should create a second user', function(done) {
        createUser(1, done);
    });

    it('should get an authentication token for the first user', function (done) {
        getToken(0, done);
    });

    it('should get an authentication token for the second user', function (done) {
        getToken(1, done);
    });

    it('should not get an authentication token with an incorrect password', function (done) {
        getBadToken(0, "wrongpass", done);
    });

    it('should get first user data from valid token', function (done) {
        getUserFromToken(0, done);
    });

    it('should get second user data from valid token', function (done) {
        getUserFromToken(1, done);
    });

    it('should delete first created user', function(done) {
        deleteUser(0, 'handle', done);
    });

    it('should delete second created user', function (done) {
        deleteUser(1, 'handle', done);
    });
});