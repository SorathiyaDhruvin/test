const CAMPUS_GRAPH = {
  ios_lab: {
    title: "iOS Lab",
    image: "assets/360/image8.jpeg",
    links: {
      forward: "corridor"
    }
  },

  corridor: {
    title: "Main Corridor",
    image: "assets/360/image2.jpeg",
    links: {
      back: "ios_lab",
      forward: "data_center",
      right: "cv_raman_gate"
    }
  },

  data_center: {
    title: "Data Center",
    image: "assets/360/image1.jpeg",
    links: {
      back: "corridor"
    }
  },

  cv_raman_gate: {
    title: "CV Raman Gate",
    image: "assets/360/image5.jpeg",
    links: {
      left: "corridor"
    }
  }
};
