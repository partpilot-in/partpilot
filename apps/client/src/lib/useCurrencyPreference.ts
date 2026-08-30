import { useEffect, useState } from "react";
import {
  currencyPreferenceChangeEvent,
  readCurrencyPreference,
  saveCurrencyPreference,
  type CurrencyCode,
} from "./format";

export function useCurrencyPreference() {
  const [currency, setCurrency] = useState<CurrencyCode>(() =>
    readCurrencyPreference(),
  );

  useEffect(() => {
    function syncCurrency() {
      setCurrency(readCurrencyPreference());
    }

    window.addEventListener(currencyPreferenceChangeEvent, syncCurrency);
    window.addEventListener("storage", syncCurrency);

    return () => {
      window.removeEventListener(currencyPreferenceChangeEvent, syncCurrency);
      window.removeEventListener("storage", syncCurrency);
    };
  }, []);

  function updateCurrency(nextCurrency: CurrencyCode) {
    saveCurrencyPreference(nextCurrency);
    setCurrency(nextCurrency);
  }

  return { currency, updateCurrency };
}
