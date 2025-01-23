import { ObjectId } from 'mongodb';
import { v4 } from 'uuid';
import fs from 'fs';
import mime from 'mime-types';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

export default class FilesController {
  static async postUpload(req, res) {
    const key = req.header('X-Token');
    const session = await redisClient.get(`auth_${key}`);
    if (!key || key.length === 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (session) {
      const { name } = req.body;
      const { type } = req.body;
      let { parentId } = req.body;
      const { isPublic } = req.body;
      const { data } = req.body;
      const types = ['folder', 'file', 'image'];

      if (!name) {
        return (res.status(400).json({ error: 'Missing name' }));
      } if ((!type) || types.includes(type) === false) {
        return (res.status(400).json({ error: 'Missing type' }));
      }

      if (!data && type !== types[0]) {
        return (res.status(400).json({ error: 'Missing data' }));
      }
      if (!parentId) { parentId = 0; }
      if (parentId !== 0) {
        const search = await dbClient.db.collection('files').find({ _id: ObjectId(parentId) }).toArray();
        if (search.length < 1) {
          return (res.status(400).json({ error: 'Parent not found' }));
        }
        if (types[0] !== search[0].type) {
          return (res.status(400).json({ error: 'Parent is not a folder' }));
        }
      }
      const userId = session;
      if (type === types[0]) {
        const folder = await dbClient.db.collection('files').insertOne({
          name,
          type,
          userId: ObjectId(userId),
          parentId: parentId !== 0 ? ObjectId(parentId) : 0,
          isPublic: isPublic || false,
        });
        return res.status(201).json({
          id: folder.ops[0]._id,
          userId: folder.ops[0].userId,
          name: folder.ops[0].name,
          type: folder.ops[0].type,
          isPublic: folder.ops[0].isPublic,
          parentId: folder.ops[0].parentId,
        });
      }

      const buff = Buffer.from(data, 'base64').toString('utf-8');
      const path = process.env.FOLDER_PATH || '/tmp/files_manager';
      const newFile = v4();

      if (!fs.existsSync(path)) {
        fs.mkdirSync(path, { recursive: true });
      }
      fs.writeFile(`${path}/${newFile}`, buff, (err) => {
        if (err) {
          return (res.status(400).json({ error: err.message }));
        }
        return true;
      });
      const file = await dbClient.db.collection('files').insertOne({
        name,
        type,
        userId: ObjectId(userId),
        parentId: parentId !== 0 ? ObjectId(parentId) : 0,
        isPublic: isPublic || false,
        data,
        localPath: `${path}/${newFile}`,
      });

      return res.status(201).json({
        id: file.ops[0]._id,
        userId: file.ops[0].userId,
        name: file.ops[0].name,
        type: file.ops[0].type,
        isPublic: file.ops[0].isPublic,
        parentId: file.ops[0].parentId,
      });
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }

  static async getShow(req, res) {
    const key = req.header('X-Token');
    const session = await redisClient.get(`auth_${key}`);
    if (!key || key.length === 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (session) {
      const { id } = req.params;
      let search;
      try {
        search = await dbClient.db.collection('files').find({ _id: ObjectId(id), userId: ObjectId(session) }).toArray();
      } catch (err) {
        return res.status(404).json({ error: 'Not found' });
      }
      if (!search || search.length < 1) {
        return res.status(404).json({ error: 'Not found' });
      }
      return res.status(200).json(search[0]);
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }

  static async getIndex(req, res) {
    const key = req.header('X-Token');
    if (!key || key.length === 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const session = await redisClient.get(`auth_${key}`);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let { page = 0, parentId = '0' } = req.query;
    page = parseInt(page, 10);
    try {
      parentId = ObjectId(parentId);
    } catch (err) {
      return res.status(200).json([]);
    }

    const search = await dbClient.db.collection('files').aggregate([
      {
        $match: { parentId, userId: ObjectId(session) },
      },
      {
        $skip: page * 20,
      },
      {
        $limit: 20,
      },
    ]).toArray();

    if (search) {
      return res.status(200).send(search);
    }
    return res.status(200).send([]);
  }

  static async putPublish(req, res) {
    const key = req.header('X-Token');
    const session = await redisClient.get(`auth_${key}`);
    if (!key || key.length === 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (session) {
      const { id } = req.params;
      if (!id || id === '') {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      let search = [];
      try {
        search = await dbClient.db.collection('files').find({ _id: ObjectId(id), userId: ObjectId(session) }).toArray();
      } catch (e) {
        return (res.status(404).json({ error: 'Not found' }));
      }
      if (!search || search.length < 1) {
        return (res.status(404).json({ error: 'Not found' }));
      }
      await dbClient.db.collection('files').updateOne({ _id: ObjectId(id) }, { $set: { isPublic: true } });
      const search1 = await dbClient.db.collection('files').find({ _id: ObjectId(id), userId: ObjectId(session) }).toArray();
      if (!search1 || search1.length < 1) {
        return (res.status(404).json({ error: 'Not found' }));
      }
      return res.status(200).json({
        id: search1[0]._id,
        userId: search1[0].userId,
        name: search1[0].name,
        type: search1[0].type,
        isPublic: search1[0].isPublic,
        parentId: search1[0].parentId,
      });
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }

  static async putUnpublish(req, res) {
    const key = req.header('X-Token');
    const session = await redisClient.get(`auth_${key}`);
    if (!key || key.length === 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (session) {
      const { id } = req.params;
      if (!id || id === '') {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      let search = [];
      try {
        search = await dbClient.db.collection('files').find({ _id: ObjectId(id), userId: ObjectId(session) }).toArray();
      } catch (e) {
        return (res.status(404).json({ error: 'Not found' }));
      }
      if (!search || search.length < 1) {
        return (res.status(404).json({ error: 'Not found' }));
      }
      await dbClient.db.collection('files').updateOne({ _id: ObjectId(id) }, { $set: { isPublic: false } });
      const search1 = await dbClient.db.collection('files').find({ _id: ObjectId(id), userId: ObjectId(session) }).toArray();
      if (!search1 || search1.length < 1) {
        return (res.status(404).json({ error: 'Not found' }));
      }
      return res.status(200).json({
        id: search1[0]._id,
        userId: search1[0].userId,
        name: search1[0].name,
        type: search1[0].type,
        isPublic: search1[0].isPublic,
        parentId: search1[0].parentId,
      });
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }

  static async getFile(req, res) {
    const { id } = req.params;

    // Validate and get the file
    let file;
    try {
      file = await dbClient.db.collection('files').findOne({ _id: ObjectId(id) });
    } catch (err) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    // Check if it's a folder
    if (file.type === 'folder') {
      return res.status(400).json({ error: "A folder doesn't have content" });
    }

    // Check file access permissions
    if (!file.isPublic) {
      const token = req.header('X-Token');
      if (!token) {
        return res.status(404).json({ error: 'Not found' });
      }

      const userId = await redisClient.get(`auth_${token}`);
      if (!userId || file.userId.toString() !== userId) {
        return res.status(404).json({ error: 'Not found' });
      }
    }

    // Check if file exists locally
    if (!fs.existsSync(file.localPath)) {
      return res.status(404).json({ error: 'Not found' });
    }

    // Get MIME type and serve file
    const mimeType = mime.contentType(file.name);

    try {
      const data = fs.readFileSync(file.localPath);
      res.setHeader('Content-Type', mimeType);
      return res.send(data);
    } catch (error) {
      return res.status(404).json({ error: 'Not found' });
    }
  }
}
