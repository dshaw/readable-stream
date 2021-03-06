// a transform stream is a readable/writable stream where you do
// something with the data.  Sometimes it's called a "filter",
// but that's not a great name for it, since that implies a thing where
// some bits pass through, and others are simply ignored.  (That would
// be a valid example of a transform, of course.)
//
// While the output is causally related to the input, it's not a
// necessarily symmetric or synchronous transformation.  For example,
// a zlib stream might take multiple plain-text writes(), and then
// emit a single compressed chunk some time in the future.

'use strict';

module.exports = Transform;

var Readable = require('./readable.js');
var Writable = require('./writable.js');

var util = require('util');

util.inherits(Transform, Readable);

// parasitic inheritance.
Object.keys(Writable.prototype).forEach(function(method) {
  if (!Transform.prototype[method])
    Transform.prototype[method] = Writable.prototype[method];
});

function Transform(options) {
  Readable.call(this, options);
  Writable.call(this, options);

  // bind output so that it can be passed around as a regular function.
  this._output = this._output.bind(this);

  // when the writable side finishes, then flush out anything remaining.
  this.once('finish', function() {
    if ('function' === typeof this._flush)
      this._flush(this._output, done.bind(this));
    else
      done.call(this);
  });
}

// This is the part where you do stuff!
// override this function in implementation classes.
// 'chunk' is an input chunk.
//
// Call `output(newChunk)` to pass along transformed output
// to the readable side.  You may call 'output' zero or more times.
//
// Call `cb(err)` when you are done with this chunk.  If you pass
// an error, then that'll put the hurt on the whole operation.  If you
// never call cb(), then you'll never get another chunk.
Transform.prototype._transform = function(chunk, output, cb) {
  throw new Error('not implemented');
};


Transform.prototype._write = function(chunk, cb) {
  // Must force callback to be called on nextTick, so that we don't
  // emit 'drain' before the write() consumer gets the 'false' return
  // value, and has a chance to attach a 'drain' listener.
  this._transform(chunk, this._output, function(er) {
    process.nextTick(function() {
      cb(er);
    });
  });
};

Transform.prototype._read = function(n, cb) {
  var ws = this._writableState;
  var rs = this._readableState;

  // basically a no-op, since the _transform will fill the
  // _readableState.buffer and emit 'readable' for us, and set ended
  // Usually, we want to just not call the cb, and set the reading
  // flag to false, so that another _read will happen next time,
  // but no state changes.
  rs.reading = false;

  // however, if the writable side has ended, and its buffer is clear,
  // then that means that the input has all been consumed, and no more
  // will ever be provide.  treat this as an EOF, and pass back 0 bytes.
  if ((ws.ended || ws.ending) && ws.length === 0)
    cb();
};

Transform.prototype._output = function(chunk) {
  if (!chunk || !chunk.length)
    return;

  var state = this._readableState;
  var len = state.length;
  state.buffer.push(chunk);
  state.length += chunk.length;
  if (state.needReadable) {
    state.needReadable = false;
    this.emit('readable');
  }
};

function done(er) {
  if (er)
    return this.emit('error', er);

  // if there's nothing in the write buffer, then that means
  // that nothing more will ever be provided
  var ws = this._writableState;
  var rs = this._readableState;

  rs.ended = true;
  // we may have gotten a 'null' read before, and since there is
  // no more data coming from the writable side, we need to emit
  // now so that the consumer knows to pick up the tail bits.
  if (rs.length && rs.needReadable)
    this.emit('readable');
  else if (rs.length === 0) {
    this.emit('end');
  }
}

