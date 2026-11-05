// Isolated browser fixtures must never invoke server mutations.
async function unavailable() { throw new Error("Server actions are unavailable in this frontend fixture"); }
export {
  unavailable as transitionOrder, unavailable as recordPayment,
  unavailable as loginAction, unavailable as registerAction,
  unavailable as updateProfileAction, unavailable as saveAddressAction, unavailable as deleteAddressAction,
  unavailable as archiveProduct, unavailable as saveProduct, unavailable as saveReference, unavailable as saveUnit,
};
