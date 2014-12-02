/**
 * Chromecast for canalplus.fr
 * v.0.1 [alpha]
 *
 * This is a bit semantic, but who care, this is just a bad hack.
 * If you like italian cuisine, you will love this spaguetti code, enjoy!
 *
 */

(function (window) {

  /**
   * Const declarations
   * These variables must change during the execution
   *
   * 
   * POPUP_CLASS   Class name of the popup
   * CCBTN_CLASS   Class name of chromecast buttons
   * PRMPT_CLASS   Class name of the promptr
   * HTML_INTRO    Panel introduction (html)
   * HTML_PRMPT    Prompt message in case of problem or success (html)
   * HTML_CLOSE    Close button (html)
   * CC_SCRIPT     Script url of the chromecast api
   * STYLE_TAG     Inline styling of the panel (html)
   */
  var POPUP_CLASS = 'cc_fc',
      CCBTN_CLASS = 'cc_btn',
      CCRDY_CLASS = 'cc_ready',
      PRMPT_CLASS = 'cc_promptr',
      HTML_INTRO  = '<h1 class="mod-title">CAST + <small>chromecast for Canal Plus</small></h1><p>L\'extension Chrome est necessaire pour profiter du Chromecast (<a href="https://chrome.google.com/webstore/detail/google-cast/boadgeojelhgndaghljhdicfkmllpafd">disponible ici</a>).</p>',
      HTML_PRMPT  = '<h2 id="' + PRMPT_CLASS + '"></h2>',
      HTML_CLOSE  = '<div onclick="this.parentNode.remove();" style="position:absolute; top:5px; right:5px;cursor: pointer;font-size: 3em;line-height: 0.5em;">&#215;</div>',
      CC_SCRIPT   = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js',
      STYLE_TAG   = '<style>' +
                      '.' + POPUP_CLASS + ' {position: absolute; top: 0; left: 0; padding: 2%; width: 100%; z-index: 99999; background: white; box-sizing: border-box; border-bottom: 5px solid #000000;} ' +
                      '.' + POPUP_CLASS + ' h1 {margin-bottom: 15px;} ' +
                      '.' + PRMPT_CLASS + ' {padding: 4px; border-radius: 4px; color: #fff;}' +
                      '.' + PRMPT_CLASS + '.error {background: #d00;}' +
                      '.' + PRMPT_CLASS + '.info  {background: #0d0;}' +
                      '.' + CCBTN_CLASS + ' {display: none; position: absolute; z-index: 1337; top: 0; left: 0; width: 58px; height: 40px; background: url("//maxwellito.github.io/chromecast-canal-plus/assets/chromecast_icon.svg") rgba(0,0,0,0.75) no-repeat center center; background-size: 32px; cursor: pointer;}' +
                      '.' + CCRDY_CLASS + ' .' + CCBTN_CLASS + ' {display: block;}' +
                    '</style>';

  /**
   * INITIALIZE ***************************************************************
   *
   * Let's start the magic:
   * Find all the DOM elements representing a video then perform
   * a request to get the video data to generate Chromecast buttons.
   *
   * While making requests, the intro popup is generated and inserted
   * in the page.
   *
   * Then finish by init the Chromecast
   */
  
  var promptrDial,                       // DOM element of the warning paragraph
      videoIdPattern      = /^[0-9]+$/,  // Regexp to check videoIds
      videoInfoCallbacks  = {},          // Contain callbacks for a loaded videoId (videoId => array(callbacks))
      videoInfoData       = {};          // Contain the videoInfo object for a videoId (videoId => object)

  start();

  /**
   * Start the execution
   *
   */
  function start () {
    var id, tag, newTags;

    // Get the DOM element representing a video then start
    // a request for each of them to display the Chromecast button
    newTags = document.querySelectorAll('.playerVideo, *[id^=video_], .unit.unit-feature.blockcom-illu.parent-cglow.parent-fil-mign, div.img a[class=""]'); // a[href*="vid="]
    for (var i = 0; i < newTags.length; i++) {
      tag = newTags[i];

      // Avoid founded tags
      if (tag.querySelector('.' + CCBTN_CLASS)) {
        tag.parentNode.style.position = 'relative';
        continue;
      }
      // Find the ID
      switch (tag.tagName) {
      case 'A':
        if (!tag.childElementCount) {
          continue;
        }
        id = (tag.href && tag.href.substr(-7));
        tag.href = '#';
        break;
      case 'DIV':
        id = (tag.id && tag.id.substr(6)) || window.videoId || window.historyVideoId;
        break;
      default:
        id = '';
      }
      // Check if the ID is valid
      if (videoIdPattern.test(id)) {
        addChromecastButton(tag, id);
      }
    }

    // Display the popup
    insertPopup();

    // Init the Chromecast
    // Check if already executed
    if (!window.chromecaster) {
      initChromecast();
    }
  }


  /**
   * DATA RETRIEVING *********************************************************
   *
   */

  /**
   * Create a Chromecast button (linked to the videoId)
   * in the DOMobject given in parameter.
   *
   * @param {object} DOMobject DOMobject to insert the button in
   * @param {String} videoId   Id of the video to link
   */
  function addChromecastButton (DOMobject, videoId) {
    var ccBtnAction;

    // Create and set the DOM
    ccBtnDom = document.createElement('div');
    ccBtnDom.className = CCBTN_CLASS;
    ccBtnDom.onclick = function (e) {
      // Kill propagation
      e.stopPropagation();
      window.event.cancelBubble = true;

      getInfo(videoId, function (video) {
        // Check the data
        if (!(video && video.MEDIA && video.MEDIA.VIDEOS && video.MEDIA.VIDEOS.HLS)) {
          console.error('Chromecast Canal+: Cannot retrieve video information about the stream');
          console.error('>> ', {
            videoId: videoId,
            videoInfo: videoInfo,
            DOMobject: DOMobject
          });
          return;
        }
        window.chromecaster(
          video.MEDIA.VIDEOS.HLS,
          (video.INFOS && video.INFOS.TITRAGE && video.INFOS.TITRAGE.TITRE),
          (video.INFOS && video.INFOS.TITRAGE && video.INFOS.TITRAGE.SOUS_TITRE),
          video.DURATION
        );
      });
    };

    // Add the Chromecast button as child of the DOMobject
    DOMobject.style.position = 'relative';
    DOMobject.appendChild(ccBtnDom);
  }

  /**
   * Make the XHR to load JSON file, get the video infos
   * then pass them to the callback.
   * A caching system block any double request for the same ID
   *
   * @param  {Array}   videoId   ID of the video to load
   * @param  {Function} callback Callback called once the data is ready
   */
  function getInfo (videoId, callback) {
    // Let's check if the data is available
    // otherwise, let's store the callback
    if (videoInfoData[videoId]) {
      callback(videoInfoData[videoId]);
      return;
    }
    else if (videoInfoCallbacks[videoId]) {
      videoInfoCallbacks[videoId].push(callback);
      return;
    }
    else {
      videoInfoCallbacks[videoId] = [callback];
    }

    // Let's start the request
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'http://service.canal-plus.com/video/rest/getVideosLiees/cplus/' + videoId + '?format=json', true);
    xhr.onreadystatechange = function (aEvt) {
      if (this.readyState == 4 && this.status == 200) {
        try {
          var i, jsonData = JSON.parse(this.responseText);
          if (jsonData.ID) {
            videoInfoData[jsonData.ID] = jsonData;
          }
          else {
            for (i = jsonData.length - 1; i>=0; i--) {
              videoInfoData[jsonData[i].ID] = jsonData[i];
            }
          }
          
          for (i = videoInfoCallbacks[videoId].length - 1; i>=0; i--) {
            videoInfoCallbacks[videoId][i](videoInfoData[videoId] || {});
          }
          videoInfoCallbacks[videoId] = null;
        }
        catch (e) {
          console.error('Chromecast Canal+: Failed to parse ' + videoId);
          console.error('>> ', e);
        }
      }
    };
    xhr.send(null);
  }


  /**
   * POPUP *********************************************************************
   *
   * Little box at the top, to display information
   */

  /**
   * Create and inject the intro popup into the page
   *
   */
  function insertPopup() {
    // Create and set the DOM
    finalDom = document.createElement('div');
    finalDom.className = POPUP_CLASS;
    finalDom.innerHTML = HTML_CLOSE + HTML_INTRO + HTML_PRMPT + STYLE_TAG;
    document.body.appendChild(finalDom);

    // Save the promptrDial object
    promptrDial = document.querySelector('#' + PRMPT_CLASS);

    // Then scroll
    window.scrollTo(0,0);
  }

  /**
   * Log method
   * It show information to the final user via the warn title
   * and use console to keep a trace of all messages.
   * Making it easier to debug. 
   * 
   * @param  {string} type        Type of message (error or info)
   * @param  {string} msg         Message to display
   * @param  {*}      extraObject Extra object to put in the log
   */
  function promptr(type, msg, extraObject) {
    if (promptrDial) {
      promptrDial.className = PRMPT_CLASS + ' ' + type;
      promptrDial.innerText = msg;
    }
    else {
      console.warn('The promptr is not initialised');
    }

    if (console[type]) {
      if (arguments.length == 2) {
        (console[type])(msg);
      }
      else {
        (console[type])(msg, extraObject);
      }
    }
  }

  /**
   * CHROMECAST ***************************************************************
   *
   * In these method, the object `console` is used, quite often.
   * But this code can only be executed in a Chrome environment,
   * so the `console` object will be available and won't break
   * the code.
   *
   * This part of the code is still in beta test, the log will
   * be used to debug the script if necessary.
   */

  /**
   * Init the Chromecast to check if the API is available
   * and get the necessary IDs
   *
   */
  function initChromecast () {

    // Listener setup for when the chromecast is available
    window['__onGCastApiAvailable'] = function (loaded, errorInfo) {
      if (loaded) {
        initializeCastApi();
      } else {
        promptr('error','Chromecast API error', errorInfo);
      }
    };

    // Check if the Chromecast is initialised
    // (might happend if one day Canal+ implement the Chromecast)
    if (!chrome.cast || !chrome.cast.isAvailable) {
      setTimeout(initializeCastApi, 1000);
    }

    // Init the Cast API
    function initializeCastApi () {
      console.info('Initialize Chromecast API');
      var sessionRequest = new chrome.cast.SessionRequest(chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID);
      var apiConfig = new chrome.cast.ApiConfig(sessionRequest, sessionListener, receiverListener);
      chrome.cast.initialize(apiConfig, onInitSuccess, onError);
    }

    function sessionListener (e) {
      console.log('SessionListener', e);
    }

    function receiverListener (e) {
      if (e === chrome.cast.ReceiverAvailability.AVAILABLE) {
        // Perfect time to show the chromecast button
        promptr('info','Chromecast available');
        document.body.className += ' ' + CCRDY_CLASS;
      }
      else {
        promptr('error', 'Chromecast non disponible');
      }
    }

    function onInitSuccess () {
      console.info('Succesfully init');
    }

    function onError (e) {
      promptr('error', 'L\'initialisation du Chromecast a echoue', e);
    }

    // Inject the Chromecast script
    var ccScriptDom = document.createElement('script');
    ccScriptDom.src = CC_SCRIPT;
    document.body.appendChild(ccScriptDom);
  }

  /**
   * Start to cast the video URL given as parameter.
   * The media must be an HLS video (:application/vnd.apple.mpegurl).
   * This is the only one method available from
   * the global namespace.
   *
   * @param  {string}  currentMediaURL Video URL
   * @param  {string}  title           Video title [optional]
   * @param  {string}  subtitle        Video subtitle [optional]
   * @param  {integer} duration        Video duration in seconds [optional]
   */
  window.chromecaster = window.chromecaster || function (currentMediaURL, title, subtitle, duration) {

    console.info('chromecaster called', arguments);

    if (window.chromecasterSession) {
      onRequestSessionSuccess(window.chromecasterSession);
    }
    else {
      // Request a session to cast
      chrome.cast.requestSession(onRequestSessionSuccess, onLaunchError);
    }

    function onLaunchError (e) {
      promptr('error', 'La demande de session a echoue', e);
      window.chromecasterSession = null;
    }

    function onRequestSessionSuccess (session) {
      window.chromecasterSession = session;

      var mediaInfo = new chrome.cast.media.MediaInfo(currentMediaURL);
      mediaInfo.contentType    = 'application/vnd.apple.mpegurl';
      mediaInfo.metadata       = {
        title:    title    || 'Canal+',
        subtitle: subtitle || 'Chromecast pour canalplus.fr'
      };
      mediaInfo.customData     = null;
      mediaInfo.streamType     = chrome.cast.media.StreamType.BUFFERED;
      mediaInfo.textTrackStyle = new chrome.cast.media.TextTrackStyle();
      mediaInfo.duration       = (duration && parseInt(duration, 10)) || null;

      var request = new chrome.cast.media.LoadRequest(mediaInfo);
      session.loadMedia(request,
         onMediaDiscovered.bind(this, 'loadMedia'),
         onMediaError);

      function onMediaDiscovered(how, media) {
        promptr('info', 'Media discovered', [how, media]);
        currentMedia = media;
        currentMedia.play(null,
          function (e) {promptr('info', 'Cast operationel!');},
          function (e) {promptr('error','Cast erreur, et la c\'est le drame');}
        );
      }

      function onMediaError(e) {
        promptr('error','Media erreur, et la c\'est le drame', e);
      }
    }
  };

})(window);
