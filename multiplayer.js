const firebaseConfig = {
    apiKey: "AIzaSyDxf3c2QdHy_e2FpdVt_AUNXA58QbqD9hI",
    authDomain: "twine-test-1.firebaseapp.com",
    databaseURL: "https://twine-test-1-default-rtdb.firebaseio.com",
    projectId: "twine-test-1",
    storageBucket: "twine-test-1.appspot.com",
    messagingSenderId: "265490233768",
    appId: "1:265490233768:web:15e19d3e84beba0a8dc59d"
  };
  window.Multiplayer = (function(){
      var lsLockID, firebaseApp, db,
              worldRef, roomsRef, roomRef, playerRef,
              playerID = 'qo97yLPkmusdLMhuDX0q',
              roomID = 'tK6r0ADXJCZzoPlmfsPe',
              rooms = [],
              ready = false;
      
      function save(){
          if(!ready){return false};
          const saveData = {...SugarCube.State.variables};
          try {
              worldRef.set(saveData.world);
          } catch(e){console.warn(e)}
          try {
              roomRef.set(saveData.room);
          } catch(e){console.warn(e)}
          delete saveData.world;
          delete saveData.room;
          try {
              playerRef.set(saveData);
          } catch(e){console.warn(e)}
      }
      
      function initDB(){
          db = firebase.firestore();
          getRefs();
          buildRefEvents();
          return Promise.all([
              worldRef.get(),
              roomRef.get(),
              playerRef.get(),
          ]);
      }
      
      function getRefs(){
          worldRef = db.collection('worldState').doc("0");
          roomsRef = db.collection('rooms');
          roomRef = roomsRef.doc(roomID);
          playerRef = db.collection('players').doc(playerID);
      }
      
      function buildRefEvents(){
          worldRef.onSnapshot(doc => {
            SugarCube.State.variables.world = doc.data();
            console.log("World Updated: ", SugarCube.State.variables.world);
          });
          roomRef.onSnapshot(doc => {
            SugarCube.State.variables.room = doc.data();
              console.log("Room Updated: ", SugarCube.State.variables.room);
          });
          playerRef.onSnapshot(doc => {
              Object.entries(doc.data()).forEach(([key, val]) => {
                SugarCube.State.variables[key] = val;
              });
              console.log("Player Updated: ", SugarCube.State.variables);
          });
      }
      
      async function start(){
          lsLockID = LoadScreen.lock();
          
          SugarCube.State.reset();
          SugarCube.State.variables.world = {};
          SugarCube.State.variables.room = {};
          
          await initDB();
          
          SugarCube.Engine.play(SugarCube.Config.passages.start);
          ready = true;
          SugarCube.LoadScreen.unlock(lsLockID);
          
          $(document).on(':passagerender', e => {
              save();
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
      
      function init(fc){
          configure();
          importScripts("https://www.gstatic.com/firebasejs/8.10.0/firebase.js")
          .then(() => {
              firebaseApp = firebase.initializeApp(fc);
              start();
          });
      }
      
      return {
          playerID,
          roomID,
          ready,
          init,
      };
  })();
  Multiplayer.init(firebaseConfig);