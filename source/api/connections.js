// -------------------------------------------------------------------------- \\
// File: connections.js                                                       \\
// Module: API                                                                \\
// Requires: Auth.js, Connection.js                                           \\
// -------------------------------------------------------------------------- \\

/*global O, JMAP */

'use strict';

( function ( JMAP ) {

const IOQueue = O.IOQueue;
const AggregateSource = O.AggregateSource;
const Store = O.Store;

const Connection = JMAP.Connection;
const auth = JMAP.auth;

// ---

const upload = new IOQueue({
    maxConnections: 3
});

const mail = new Connection({
    id: 'mail',
});
const contacts = new Connection({
    id: 'contacts',
});
const calendar = new Connection({
    id: 'calendar',
});
const peripheral = new Connection({
    id: 'peripheral',
});

const source = new AggregateSource({
    sources: [ mail, contacts, calendar, peripheral ],
    hasInFlightChanges: function () {
        return this.sources.some( function ( source ) {
            var inFlightRemoteCalls = source.get( 'inFlightRemoteCalls' );
            return inFlightRemoteCalls && inFlightRemoteCalls.some(
                function ( req ) {
                    var method = req[0];
                    var type = method.slice( method.indexOf( '/' ) + 1 );
                    return type === 'set' || type === 'copy';
                });
        }) || !!upload.get( 'activeConnections' );
    },
});

// (Overriding from Overture, at a designated extension point.)
Store.prototype.getPrimaryAccountIdForType = function ( Type ) {
    return auth.get( 'primaryAccounts' )[ Type.dataGroup ];
};

const store = new Store({
    source: source,
    updateAccounts: function () {
        const accounts = auth.get( 'accounts' );
        const primaryMailAccountId =
            auth.get( 'primaryAccounts' )[ auth.MAIL_DATA ];
        var accountId, account;
        for ( accountId in accounts ) {
            account = accounts[ accountId ];
            this.addAccount( accountId, {
                replaceAccountId: accountId === primaryMailAccountId ?
                    'PLACEHOLDER MAIL ACCOUNT ID' : undefined,
                accountCapabilities: account.accountCapabilities,
            });
        }
    },
});
auth.addObserverForKey( 'accounts', store, 'updateAccounts' );

// --- Export

JMAP.upload = upload;
JMAP.mail = mail;
JMAP.contacts = contacts;
JMAP.calendar = calendar;
JMAP.peripheral = peripheral;
JMAP.source = source;
JMAP.store = store;

}( JMAP ) );
