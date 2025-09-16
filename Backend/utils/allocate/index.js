const allocateEV = require("./allocateEV");
const allocateGQFSF = require("./allocateGQFSF");
const allocateGQNonFSF = require("./allocateGQNonFSF");
const allocateAdikosh = require("./allocateAdikosh");
const allocateBL = require("./allocateBL");
const allocateEmbifi =require("./allocateEmbifi");

const allocateRepaymentByLAN = async (lan, payment) => {
  if (lan.startsWith("EV") || lan.startsWith("WCTL")  ) {
    return allocateEV(lan, payment);
  } else if (lan.startsWith("GQF")) {
    return allocateGQFSF(lan, payment);
   } else if (lan.startsWith("BL")) {
    return allocateBL(lan, payment);
  } else if (lan.startsWith("GQN")) {
    return allocateGQNonFSF(lan, payment);
  } else if (lan.startsWith("ADK")) {
    return allocateAdikosh(lan, payment);
    } else if (lan.startsWith("E1")) {
    return allocateEmbifi(lan, payment);
  } else {
    throw new Error(`Unknown LAN prefix for allocation: ${lan}`);
  }
};

module.exports = { allocateRepaymentByLAN };
