import { v4 } from 'uuid';
import crypto from 'crypto';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

export default class AuthController {
  static async getConnect(req, res) {
    const user = req.header('Authorization');
    if (!user || user.length === 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const data = user.substring(6);
    const buff = Buffer.from(data, 'base64').toString('utf-8');
    const credentials = buff.split(':');

    if (!credentials || credentials.length === 1) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const email = credentials[0].toString('utf-8');
    const password = credentials[1].toString('utf-8');

    const hashpwd = crypto.createHash('sha1').update(password, 'utf-8').digest('hex');

    const search = await dbClient.db.collection('users').find({ email, password: hashpwd }).toArray();
    if (search.length < 1 || hashpwd !== search[0].password) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const key = v4();
    const token = `auth_${key}`;

    await redisClient.set(token, search[0]._id.toString(), 86400);

    return res.status(200).json({ token: key });
  }

  static async getDisconnect(req, res) {
    const key = req.header('X-Token');

    if (!key || key.length === 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (await redisClient.get(`auth_${key}`)) {
      await redisClient.del(`auth_${key}`);
      return res.status(204).end();
    }

    return res.status(401).json({ error: 'Unauthorized' });
  }
}
