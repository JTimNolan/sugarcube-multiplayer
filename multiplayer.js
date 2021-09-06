window.Multiplayer = (function(){
    var storyID, lsLockID, firebaseApp, db,
        storyRef, roomsRef, roomRef, playersRef, playerRef,
        storyData, roomData, playerData,
        imports, LoadScreen,
        playerID,
        unsubs = {},
        roomID = 'lobby',
        rooms = [],
        debug = false,
        ready = false;

    function log(){
        if(!debug){return}
        console.log('[MULTI] ', ...arguments);
    }

    function getUser(){
        return firebase.auth().currentUser;
    }

    function isLoggedIn(){
        return firebase.auth().currentUser && !firebase.auth().currentUser.isAnonymous;
    }
    
    async function initAuth(){
        function getAuthState(){
            return new Promise(resolve => {
                const unsub = firebase.auth().onAuthStateChanged(user => {
                    unsub();
                    resolve(user);
                });
            });
        }
        var user = await getAuthState();
        if(user){
            log("User data loaded", user.uid, user.isAnonymous ? 'anon' : 'logged in');
        } else {
            await initAnon();
        }
    }

    async function initAnon(){
        await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION);
        const data = await firebase.auth().signInAnonymously();
        log("Anon user initialized", data.user);
        await resetPlayerRefs();
    }

    async function login(email, password){
        if(typeof Multiplayer.validateLogin == 'function'){
            const errors = Multiplayer.validateLogin(email, password);
            if(errors && errors.length > 0){
                return {success: false, errors};
            }
        }
        let response;
        try {
            response = await firebase.auth().signInWithEmailAndPassword(email, password);
        } catch(e){
            if(e.code == 'auth/user-not-found'){
                try {
                    const credential = firebase.auth.EmailAuthProvider.credential(email, password);
                    response = await firebase.auth.currentUser.linkWithCredential(credential);
                } catch(errors){
                    return {success: false, errors};
                }
            } else {
                log(response);
                return {success: false, e};
            }
        }
        log(response);
        await resetPlayerRefs();
        return {success: true, response, user: response.user};
    }

    async function logout(passageName){
        await firebase.auth().signOut();
        await initAnon();
        if(passageName){
            SugarCube.Engine.play(passageName);
        }
        return;
    }
    
    function save(){
        // TODO: Only save differences
        if(!ready){return false};
        const saveData = {...SugarCube.State.variables};
        log("Saving data", Multiplayer.playerID, saveData)
        try {
            storyRef.set({
                ...storyData,
                state: saveData.world,
                lastUpdateBy: getUser().uid,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
        } catch(e){console.warn(e)}
        try {
            roomRef.set({
                ...roomData,
                state: saveData.room,
                lastUpdateBy: getUser().uid,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
        } catch(e){console.warn(e)}
        delete saveData.world;
        delete saveData.room;
        try {
            playerRef.set({
                ...playerData,
                state: saveData,
                lastUpdateBy: getUser().uid,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
        } catch(e){console.warn(e)}
    }

    async function joinRoom(newRoomID, segmentToPlay){
        log("Joining room", newRoomID);
        try {
            await playerRef.set({room: newRoomID}, {merge: true});
            log("Joined, resetting refs");
            Multiplayer.roomID = newRoomID;
            await resetPlayerRefs();
            SugarCube.Engine.play(segmentToPlay || imports.start || SugarCube.Config.passages.start);
        } catch(e){
            console.error(e);
        }
    }

    async function createRoom(segmentToPlay){
        log("Creating room");
        roomRef = await roomsRef.add({
            owner: getUser().uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            state: {},
        });
        log(roomRef);
        joinRoom(roomRef.id, segmentToPlay);
    }
    
    async function initDB(){
        db = firebase.firestore();
        await setupRefs();
        return Promise.all([
            storyRef.get(),
            roomRef.get(),
            playerRef.get(),
        ]);
    }

    async function resetPlayerRefs(){
        log("Starting player ref reset", unsubs);
        const removed = ['player', 'room'].map((key) => {
            if(typeof unsubs[key] == 'function'){
                unsubs[key]();
                delete unsubs[key];
                return true;
            }
            return false;
        });
        if(removed.filter(x => x).length){
            log("Refs reset: ", removed);
            await setupPlayerRefs(true);
            return Promise.all([
                roomRef.get(),
                playerRef.get(),
            ]);
        }
    }

    async function setupPlayerRefs(isReset = false){
        const res = await playersRef.where('owner', "==", getUser().uid).get();
        if(res.docs.length){
            playerData = res.docs[0].data();
            log("Player data loaded", res.docs[0].id, playerData);
            Multiplayer.playerID = res.docs[0].id;
            Multiplayer.roomID = playerData.room;
            playerRef = playersRef.doc(Multiplayer.playerID);
        } else {
            playerRef = await playersRef.add({
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                room: 'lobby',
                owner: getUser().uid,
                state: {},
            });
            log("Player created: ", playerRef.id);
            Multiplayer.playerID = playerRef.id;
            Object.keys(SugarCube.State.variables).forEach(key => {
                if(['room', 'world'].includes(key)){
                    return;
                }
                delete SugarCube.State.variables[key];
            });
            log("Local player state reset: ", SugarCube.State.variables);
        }
        unsubs.player = playerRef.onSnapshot(doc => {
            playerData = doc.data();
            Object.entries(playerData.state).forEach(([key, val]) => {
                SugarCube.State.variables[key] = val;
            });
            log("Player Updated: ", playerData.state);
        });
        roomRef = roomsRef.doc(Multiplayer.roomID);
        unsubs.room = roomRef.onSnapshot(doc => {
            roomData = doc.data();
            SugarCube.State.variables.room = roomData.state;
            log("Room Updated: ", SugarCube.State.variables.room);
        });
    }
    
    async function setupRefs(){
        storyRef = await db.collection('stories').doc(storyID);
        roomsRef = await storyRef.collection('rooms');
        playersRef = await storyRef.collection('players');
        unsubs.story = storyRef.onSnapshot(doc => {
            storyData = doc.data();
            SugarCube.State.variables.world = storyData.state;
            log("World Updated: ", SugarCube.State.variables.world);
        });
        await setupPlayerRefs();
    }
    
    async function start(){
        
        SugarCube.State.reset();
        SugarCube.State.variables.world = {};
        SugarCube.State.variables.room = {};
        
        await initAuth();
        await initDB();
        
        log("Multiplayer setup done, starting story");
        SugarCube.Engine.play(imports.start || SugarCube.Config.passages.start);
        ready = true;
        LoadScreen.unlock(lsLockID);
        
        $(document).on(':passagerender', e => {
            save();
        });
        $(document).on('submit', 'form.multiplayer-login-form', async e => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const res = await login(formData.get('email'), formData.get('password'));
            const next = e.target.getAttribute('action');
            if(next){
                SugarCube.Engine.play(next);
            }
        });
    }
    
    function configure(){
        SugarCube.Config.saves.autoload = false;
        SugarCube.Config.saves.autosave = false;
        SugarCube.Config.saves.isAllowed = () => {false};
        SugarCube.Config.history.maxStates = 1;
        SugarCube.Config.history.controls = false;
        document.getElementById('menu-item-saves').style.display = 'none';
        document.getElementById('menu-item-restart').style.display = 'none';
    }
    
    function init(id, addl){
        storyID = id;
        imports = addl;
        LoadScreen = imports.LoadScreen;
        lsLockID = imports.lockID || LoadScreen.lock();
        SugarCube.setup.Multiplayer = this;
        debug = addl.debug || false;
        configure();
        imports.importScripts("https://www.gstatic.com/firebasejs/8.10.0/firebase.js")
        .then(() => {
            firebaseApp = firebase.initializeApp({
                apiKey: "AIzaSyDxf3c2QdHy_e2FpdVt_AUNXA58QbqD9hI",
                authDomain: "twine-test-1.firebase.com",
                databaseURL: "https://twine-test-1-default-rtdb.firebaseio.com",
                projectId: "twine-test-1",
                storageBucket: "twine-test-1.appspot.com",
                messagingSenderId: "265490233768",
                appId: "1:265490233768:web:15e19d3e84beba0a8dc59d"
            });
            start();
        });
    }
    
    return {
        playerID,
        roomID,
        ready,
        debug,
        getUser,
        init,
        login,
        logout,
        isLoggedIn,
        joinRoom,
        createRoom,
        validateLogin: () => {},
    };
})();