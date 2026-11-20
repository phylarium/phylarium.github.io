// The camp part of CORE.life: what people build on one square of the close-up, and the wild that raids it.
import { BUILDS, RAIDERS, build, canBuild, newCamp, squaresOf } from '../core/humans/camp.js';
import { campStep } from '../core/humans/camp-raid.js';
import { CAMP_N } from '../core/humans/camp-grid.js';

export const CAMP = Object.freeze({ BUILDS, CAMP_N, RAIDERS, build, campStep, canBuild, newCamp, squaresOf });
