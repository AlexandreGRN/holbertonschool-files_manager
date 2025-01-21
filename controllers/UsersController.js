import crypto from 'crypto';
import dbClient from '../utils/db';

export default class UsersController {
  static async postNew(req, res) {
    const { email, password } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Missing email' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Missing password' });
    }

    const search = await dbClient.db.collection('users').findOne({ email });
    if (!search) {
      return res.status(400).json({ error: 'Already exist' });
    }

    const hashedPassword = crypto.createHash('sha1').update(password, 'utf-8').digest('hex');
    const addUser = await dbClient.db.collection('users').insertOne({ email, hashedPassword });
    const newUser = { id: addUser.ops[0]._id, email: addUser.ops[0].email };
    return res.status(201).json(newUser);
  }
}
