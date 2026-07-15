import type { Request, Response } from 'express';

import { detectLocationFromIp, normalizeClientIp } from './geolocation.service.js';

/** Controller (doc 12 §12.2) : HTTP <-> DTO, réponse standard (doc 09 §9.1). */
export class RestaurantsController {
  detectLocation = async (req: Request, res: Response): Promise<void> => {
    const clientIp = normalizeClientIp(req.ip);
    const location = clientIp
      ? await detectLocationFromIp(clientIp)
      : { country: null, city: null };

    res.status(200).json({ success: true, data: location });
  };
}
