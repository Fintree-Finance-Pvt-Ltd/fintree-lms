// const allocateEV = require("./allocateEV");
// const allocateGQFSF = require("./allocateGQFSF");
// const allocateGQNonFSF = require("./allocateGQNonFSF");
// const allocateAdikosh = require("./allocateAdikosh");
// const allocateBL = require("./allocateBL");
// const allocateEmbifi =require("./allocateEmbifi");

// const allocateRepaymentByLAN = async (lan, payment) => {
//   if (lan.startsWith("EV") || lan.startsWith("WCTL")  ) {
//     return allocateEV(lan, payment);
//   } else if (lan.startsWith("GQF")) {
//     return allocateGQFSF(lan, payment);
//    } else if (lan.startsWith("BL")) {
//     return allocateBL(lan, payment);
//   } else if (lan.startsWith("GQN")) {
//     return allocateGQNonFSF(lan, payment);
//   } else if (lan.startsWith("ADK")) {
//     return allocateAdikosh(lan, payment);
//     } else if (lan.startsWith("E1")) {
//     return allocateEmbifi(lan, payment);
//   } else {
//     throw new Error(`Unknown LAN prefix for allocation: ${lan}`);
//   }
// };

// module.exports = { allocateRepaymentByLAN };


const allocateEV = require("./allocateEV");
const allocateGQFSF = require("./allocateGQFSF");
const allocateGQNonFSF = require("./allocateGQNonFSF");
// <-- new import: adjust filename if yours is different
const allocateGQNonFSFFintree = require("./allocateGQNonFSFFintree");
const allocateAdikosh = require("./allocateAdikosh");
const allocateBL = require("./allocateBL");
const allocateEmbifi = require("./allocateEmbifi");
const allocateFinso = require("./allocateFinso");

/**
 * Utility helpers for merging allocation results.
 */
const isPlainObject = (v) => v && typeof v === "object" && !Array.isArray(v);

const mergeAllocations = (a, b) => {
  // both arrays -> concat
  if (Array.isArray(a) && Array.isArray(b)) return a.concat(b);

  // both numbers -> sum
  if (typeof a === "number" && typeof b === "number") return a + b;

  // both objects -> merge: numeric values add, arrays concat, otherwise b overrides
  if (isPlainObject(a) && isPlainObject(b)) {
    const out = { ...a };
    for (const key of Object.keys(b)) {
      if (typeof out[key] === "number" && typeof b[key] === "number") {
        out[key] = out[key] + b[key];
      } else if (Array.isArray(out[key]) && Array.isArray(b[key])) {
        out[key] = out[key].concat(b[key]);
      } else {
        out[key] = b[key];
      }
    }
    return out;
  }

  // fallback: return both values in an object
  return { a, b };
};

const allocateRepaymentByLAN = async (lan, payment) => {
  if (lan.startsWith("EV") || lan.startsWith("WCTL")) {
    return allocateEV(lan, payment);
  } else if (lan.startsWith("GQF")) {
    return allocateGQFSF(lan, payment);
  }else if (lan.startsWith("FINS")) {
    return allocateFinso(lan, payment);
  } else if (lan.startsWith("BL")) {
    return allocateBL(lan, payment);
  } else if (lan.startsWith("GQN")) {
    const promises = [
      allocateGQNonFSF(lan, payment),
      allocateGQNonFSFFintree(lan, payment),
    ];

    const settled = await Promise.allSettled(promises);

    const fulfilled = settled
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value);

    if (fulfilled.length === 0) {
      // both failed — include both rejection reasons if available
      const reasons = settled.map((r) =>
        r.status === "rejected" ? r.reason && r.reason.message : "unknown"
      );
      throw new Error(
        `Both GQN allocation strategies failed. Reasons: ${reasons.join(" ; ")}`
      );
    }

    if (fulfilled.length === 1) {
      // only one succeeded — return it
      return fulfilled[0];
    }

    // both succeeded — merge intelligently
    return mergeAllocations(fulfilled[0], fulfilled[1]);
  } else if (lan.startsWith("ADK")) {
    return allocateAdikosh(lan, payment);
  } else if (lan.startsWith("E1")) {
    return allocateEmbifi(lan, payment);
  } else {
    throw new Error(`Unknown LAN prefix for allocation: ${lan}`);
  }
};

module.exports = { allocateRepaymentByLAN };
