"use client";

import { createContext, useContext } from "react";
import type { DisplayUnits } from "../services/workspace-options";

export const HouseUnitsContext = createContext<DisplayUnits>("mm");
export const useHouseUnits = () => useContext(HouseUnitsContext);
