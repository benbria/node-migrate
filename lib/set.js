
/*!
 * migrate - Set
 * Copyright (c) 2010 TJ Holowaychuk <tj@vision-media.ca>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var EventEmitter = require('events').EventEmitter
  , fs = require('fs')
  , _ = require('lodash');

/**
 * Expose `Set`.
 */

module.exports = Set;

/**
 * Initialize a new migration `Set` with the given `path`
 * which is used to store data between migrations.
 *
 * @param {String} path
 * @api private
 */

function Set(path) {
  this.migrations = [];
  this.path = path;
  this.pos = 0;
  this.migrationsDone = [];
};

/**
 * Inherit from `EventEmitter.prototype`.
 */

Set.prototype.__proto__ = EventEmitter.prototype;

/**
 * Save the migration data and call `fn(err)`.
 *
 * @param {Function} fn
 * @api public
 */

Set.prototype.save = function(fn){
  var self = this
    , json = JSON.stringify(_.pick(this, "migrationsDone"));
  fs.writeFile(this.path, json, function(err){
    self.emit('save');
    fn && fn(err);
  });
};

/**
 * Load the migration data and call `fn(err, obj)`.
 *
 * @param {Function} fn
 * @return {Type}
 * @api public
 */

Set.prototype.load = function(fn){
  this.emit('load');
  fs.readFile(this.path, 'utf8', function(err, json){
    if (err) return fn(err);
    try {
      fn(null, JSON.parse(json));
    } catch (err) {
      fn(err);
    }
  });
};

/**
 * Run down migrations and call `fn(err)`.
 *
 * @param {Function} fn
 * @api public
 */

Set.prototype.down = function(fn, migrationName){
  this.migrate('down', fn, migrationName);
};

/**
 * Run up migrations and call `fn(err)`.
 *
 * @param {Function} fn
 * @api public
 */

Set.prototype.up = function(fn, migrationName){
  this.migrate('up', fn, migrationName);
};

/**
 * Migrate in the given `direction`, calling `fn(err)`.
 *
 * @param {String} direction
 * @param {Function} fn
 * @api public
 */

Set.prototype.migrate = function(direction, fn, migrationName){
  var self = this;
  fn = fn || function(){};
  this.load(function(err, obj){
    if (err) {
      if ('ENOENT' != err.code) return fn(err);
    } else {
      self.migrationsDone = obj.migrationsDone || _.pluck(obj.migrations, "title") || [];
    }
    self._migrate(direction, fn, migrationName);
  });
};

/**
 * Get index of given migration in list of migrations
 *
 * @api private
 */

 function positionOfMigration(migrations, filename) {
   for(var i=0; i < migrations.length; ++i) {
     if (migrations[i].title == filename) return i;
   }
   return -1;
 }

Set.prototype.migrationsRequired = function(direction, migrationName, fn) {
  var self = this;
  fn = fn || function(){};
  this.load(function(err, obj){
    if (err) {
      if ('ENOENT' != err.code) return fn(err);
    } else {
      self.migrationsDone = obj.migrationsDone || _.pluck(obj.migrations, "title") || [];
    }
    answer = self._migrationsRequired(direction, migrationName);
    fn(null, answer);
  });
}

/**
 * Return the set of all migrations that need to be run.
 */
Set.prototype._migrationsRequired = function(direction, migrationName) {
  if (!migrationName) {
    migrationPos = direction == 'up' ? this.migrations.length : 0;
  } else if ((migrationPos = positionOfMigration(this.migrations, migrationName)) == -1) {
    console.error("Could not find migration: " + migrationName);
    process.exit(1);
  }

  if(direction == 'up') {
    migrations = _.pluck(this.migrations.slice(0, migrationPos+1), "title");

    // Find all the migrations that haven't run yet and are less than the target migration
    migrations = _.difference(migrations, this.migrationsDone);

    migrationsByTitle = {};
    _.each(this.migrations, function(migration){ migrationsByTitle[migration.title] = migration;});
    migrations = _.map(migrations, function(migration) { return migrationsByTitle[migration]; });

  } else {
    migrations = this.migrations.slice(migrationPos, this.pos).reverse();
  }

  return migrations
}

/**
 * Perform migration.
 *
 * @api private
 */

Set.prototype._migrate = function(direction, fn, migrationName){
  var self = this
    , migrations
    , migrationPos
    , migrationsByTitle;

  migrations = self._migrationsRequired(direction, migrationName);

  switch (direction) {
    case 'up':
      this.migrationsDone = this.migrationsDone.concat(_.pluck(migrations, "title"));
      break;
    case 'down':
      this.pos -= migrations.length;
      break;
  }

  function next(err, migration) {
    // error from previous migration
    if (err) return fn(err);

    // done
    if (!migration) {
      self.emit('complete');
      self.save(fn);
      return;
    }

    self.emit('migration', migration, direction);
    migration[direction](function(err){
      next(err, migrations.shift());
    }, migration.environment);
  }

  next(null, migrations.shift());
};
