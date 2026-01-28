"use client";

import { useEffect, useState } from "react";
import { getHypePriceUsd } from "./hype-price";

const CACHE_TTL_MS = 30_000;

export function useHypePrice(): { priceUsd: number | null; isLoading: boolean } {
  const [priceUsd, setPriceUsd] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchPrice = async () => {
      const price = await getHypePriceUsd();
      if (!cancelled && price !== null) setPriceUsd(price);
      if (!cancelled) setIsLoading(false);
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, CACHE_TTL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { priceUsd, isLoading };
}
