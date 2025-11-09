export const TESTIMONY_INTERVAL = 12000; // 12 seconds

export const DEFAULT_DATA = {
  targetAmount: 50000,
  currentAmount: 25000,
  testimonies: [
    "“Every ticket is a testimony that our children will worship on our own land.”",
    "“We are building a legacy of faith for generations to come.”",
    "“Our families stand together to establish a house of prayer.”",
  ],
  milestoneVerses: {
    25: "John 12:24 — Unless a seed falls to the ground, it remains alone.",
    50: "Deuteronomy 11:11 — A land watered by God.",
    75: "Psalm 127:1 — Unless the Lord builds the house...",
    100: "Isaiah 56:7 — My house will be called a house of prayer.",
  },
};

export const MILESTONE_META = {
  25: {
    className: "stage-seed",
    message: "Seed Planted! 🌱",
    gradient: "linear-gradient(135deg, rgba(46, 125, 50, 0.9), rgba(33, 150, 83, 0.7))",
  },
  50: {
    className: "stage-land",
    message: "Land Secured! 📍",
    gradient: "linear-gradient(135deg, rgba(139, 94, 60, 0.9), rgba(212, 175, 55, 0.8))",
  },
  75: {
    className: "stage-build",
    message: "Building Begins! 🧱",
    gradient: "linear-gradient(135deg, rgba(212, 175, 55, 0.9), rgba(46, 125, 50, 0.7))",
  },
  100: {
    className: "stage-home",
    message: "Home Established! 🏡",
    gradient: "linear-gradient(135deg, rgba(8, 48, 66, 0.9), rgba(212, 175, 55, 0.8), rgba(230, 81, 0, 0.8))",
  },
};

export const DEFAULT_CELEBRATION_GRADIENT =
  "linear-gradient(135deg, rgba(46,125,50,0.85), rgba(212,175,55,0.75))";


