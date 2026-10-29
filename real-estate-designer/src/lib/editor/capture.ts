"use client";

import type { CaptureApi } from "@/components/editor3d/Scene3D";

/** De 3D-weergave die op dit moment zichtbaar is in de editor (voor thumbnails en screenshots) */
export const sceneCapture: { current: CaptureApi | null } = { current: null };
