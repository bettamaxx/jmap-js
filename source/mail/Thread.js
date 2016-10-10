// -------------------------------------------------------------------------- \\
// File: Thread.js                                                            \\
// Module: MailModel                                                          \\
// Requires: API, Message.js                                                  \\
// Author: Neil Jenkins                                                       \\
// License: © 2010-2015 FastMail Pty Ltd. MIT Licensed.                       \\
// -------------------------------------------------------------------------- \\

/*global O, JMAP */

"use strict";

( function ( JMAP ) {

var Record = O.Record;

var aggregateBoolean = function ( _, key ) {
    return this.get( 'messagesNotInTrash' ).reduce(
    function ( isProperty, message ) {
        return isProperty || message.get( key );
    }, false );
}.property( 'messagesNotInTrash' ).nocache();

var aggregateBooleanInTrash = function ( _, key ) {
    return this.get( 'messagesInTrash' ).reduce(
    function ( isProperty, message ) {
        return isProperty || message.get( key );
    }, false );
}.property( 'messagesInTrash' ).nocache();

var toFrom = function ( message ) {
    var from = message.get( 'from' );
    return from && from[0] || null;
};

var sumSize = function ( size, message ) {
    return size + message.get( 'size' );
};

var Thread = O.Class({

    Extends: Record,

    isEditable: false,

    messages: Record.toMany({
        recordType: JMAP.Message,
        key: 'messageIds'
    }),

    messagesNotInTrash: function () {
        return this.get( 'messages' ).filter( function ( message ) {
            return !message.isIn( 'trash' );
        });
    }.property( 'messages' ),

    messagesInTrash: function () {
        return this.get( 'messages' ).filter( function ( message ) {
            return message.isIn( 'trash' );
        });
    }.property( 'messages' ),

    isAll: function ( status ) {
        return this.is( status ) &&
            this.get( 'messages' ).every( function ( message ) {
                return message.is( status );
            });
    },

    // Note: API Mail mutates this value; do not cache.
    mailboxCounts: function () {
        var counts = {};
        this.get( 'messages' ).forEach( function ( message ) {
            message.get( 'mailboxes' ).forEach( function ( mailbox ) {
                var id = mailbox.get( 'id' );
                if ( message.get( 'isInTrash' ) &&
                        mailbox.get( 'role' ) !== 'trash' ) {
                    return;
                }
                counts[ id ] = ( counts[ id ] ||  0 ) + 1;
            });
        });
        return counts;
    }.property( 'messages' ).nocache(),

    // ---

    isUnread: aggregateBoolean,
    isFlagged: aggregateBoolean,
    isDraft: aggregateBoolean,
    hasAttachment: aggregateBoolean,

    total: function () {
        return this.get( 'messagesNotInTrash' ).length;
    }.property( 'messages' ).nocache(),

    // senders is [{name: String, email: String}]
    senders: function () {
        return this.get( 'messagesNotInTrash' )
                   .map( toFrom )
                   .filter( O.Transform.toBoolean );
    }.property( 'messages' ).nocache(),

    size: function () {
        return this.get( 'messagesNotInTrash' ).reduce( sumSize, 0 );
    }.property( 'messages' ).nocache(),

    // ---

    isUnreadInTrash: aggregateBooleanInTrash,
    isFlaggedInTrash: aggregateBooleanInTrash,
    isDraftInTrash: aggregateBooleanInTrash,
    hasAttachmentInTrash: aggregateBooleanInTrash,

    totalInTrash: function () {
        return this.get( 'messagesInTrash' ).length;
    }.property( 'messages' ).nocache(),

    sendersInTrash: function () {
        return this.get( 'messagesInTrash' )
                   .map( toFrom )
                   .filter( O.Transform.toBoolean );
    }.property( 'messages' ).nocache(),

    sizeInTrash: function () {
        return this.get( 'messagesInTrash' ).reduce( sumSize, 0 );
    }.property( 'messages' ).nocache()
});

JMAP.mail.threadUpdateFetchRecords = true;
JMAP.mail.threadUpdateMaxChanges = 30;
JMAP.mail.handle( Thread, {
    fetch: function ( ids ) {
        this.callMethod( 'getThreads', {
            ids: ids,
            fetchMessages: true,
            fetchMessageProperties: JMAP.Message.headerProperties
        });
    },
    refresh: function ( ids, state ) {
        if ( ids ) {
            this.fetchRecords( Thread, ids );
        } else {
            this.callMethod( 'getThreadUpdates', {
                sinceState: state,
                maxChanges: this.threadUpdateMaxChanges,
                fetchRecords: this.threadUpdateFetchRecords
            });
        }
    },
    // Response handler
    threads: function ( args ) {
        this.didFetch( Thread, args );
    },
    threadUpdates: function ( args, _, reqArgs ) {
        this.didFetchUpdates( Thread, args, reqArgs );
        if ( !reqArgs.fetchRecords ) {
            this.recalculateAllFetchedWindows();
        }
        if ( args.hasMoreUpdates ) {
            var threadUpdateMaxChanges = this.threadUpdateMaxChanges;
            if ( threadUpdateMaxChanges < 120 ) {
                if ( threadUpdateMaxChanges === 30 ) {
                    // Keep fetching updates, just without records
                    this.threadUpdateFetchRecords = false;
                    this.threadUpdateMaxChanges = 100;
                } else {
                    this.threadUpdateMaxChanges = 120;
                }
                this.get( 'store' ).fetchAll( Thread, true );
                return;
            } else {
                // We've fetched 250 updates and there's still more. Let's give
                // up and reset.
                this.response
                    .error_getThreadUpdates_cannotCalculateChanges
                    .call( this, args );
            }
        }
        this.threadUpdateFetchRecords = true;
        this.threadUpdateMaxChanges = 30;
    },
    error_getThreadUpdates_cannotCalculateChanges: function ( args ) {
        var store = this.get( 'store' );
        // All our data may be wrong. Unload if possible, otherwise mark
        // obsolete.
        store.getAll( Thread ).forEach( function ( thread ) {
            if ( !store.unloadRecord( thread.get( 'storeKey' ) ) ) {
                thread.setObsolete();
            }
        });
        this.recalculateAllFetchedWindows();
        // Tell the store we're now in the new state.
        store.sourceDidFetchUpdates(
            Thread, null, null, store.getTypeState( Thread ), '' );
    }
});

JMAP.Thread = Thread;

}( JMAP ) );
