// -------------------------------------------------------------------------- \\
// File: Sequence.js                                                          \\
// Module: API                                                                \\
// Requires: namespace.js                                                     \\
// -------------------------------------------------------------------------- \\

/*global O, JMAP */

'use strict';

( function ( JMAP ) {

const Class = O.Class;
const Obj = O.Object;

// ---

const noop = function () {};

const Sequence = Class({

    Extends: Obj,

    init: function () {
        this.queue = [];
        this.index = 0;
        this.length = 0;
        this.afterwards = noop;

        Sequence.parent.constructor.call( this );
    },

    then: function ( fn ) {
        this.queue.push( fn );
        this.increment( 'length', 1 );
        return this;
    },

    lastly: function ( fn ) {
        this.afterwards = fn;
        return this;
    },

    go: function go ( data ) {
        var index = this.index;
        var length = this.length;
        if ( index < length ) {
            this.set( 'index', index + 1 );
            this.queue[ index ]( go.bind( this ), data );
        } else if ( index === length ) {
            this.afterwards( index, length );
        }
        return this;
    },

    cancel: function () {
        var index = this.index;
        var length = this.length;
        if ( index < length ) {
            this.set( 'length', 0 );
            this.afterwards( index, length );
            this.fire( 'cancel' );
        }
        return this;
    },

    progress: function () {
        var index = this.index,
            length = this.length;
        return length ? Math.round( ( index / length ) * 100 ) : 100;
    }.property( 'index', 'length' ),
});

JMAP.Sequence = Sequence;

}( JMAP ) );
