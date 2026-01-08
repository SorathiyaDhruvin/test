function smoothTransition(event, args) {
  const targetScene = args.sceneId;
  let hfov = viewer.getHfov();
  const zoom = setInterval(() => {
    if (hfov > 60) {
      hfov -= 2;
      viewer.setHfov(hfov);
    } else {
      clearInterval(zoom);
      viewer.loadScene(targetScene);
    }
  }, 10);
}

function hotspotText(div, args) {
  div.innerHTML = args;
}


fetch("config.json")
  .then(res => res.json())
  .then(config => {

    for (const id in config.scenes) {
      const scene = config.scenes[id];
      if (scene.hotSpots) {
        scene.hotSpots.forEach(h => {
          if(h.cssClass==="nav-btn"){
            h.clickHandlerFunc = smoothTransition;
          }
          if(h.type ==="info"){
            h.clickHandlerFunc = showInfo;
          }
          h.createTooltipFunc=hotspotText;
        });
      }
    }

    window.viewer = pannellum.viewer("panorama", config);
  })
  .catch(err => console.error(err));

  function showInfo(event, args) 
  {
    document.getElementById("infoTitle").innerText = args.title;
    document.getElementById("infoDescription").innerText = args.description;
    document.getElementById("infoPopup").style.display = "block";
  }

function closeInfo() {
  document.getElementById("infoPopup").style.display ="none";
}
