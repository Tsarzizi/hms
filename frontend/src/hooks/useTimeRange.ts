// src/hooks/useTimeRange.ts
import { useState } from "react";

export const useTimeRange = (defaultKey = "month") => {
  const [timeRange, setTimeRange] = useState(defaultKey);
  return { timeRange, setTimeRange };
};
