import jwt from 'jsonwebtoken';

export const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }
    
    jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret', (err, user) => {
      if (err) {
        return res.status(403).json({ message: 'Invalid token.' });
      }
      
      req.user = user;
      next();
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error in authentication' });
  }
};

export const checkRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Access denied. Not authenticated.' });
    }
    
    const authorized = Array.isArray(roles)
      ? roles.includes(req.user.role)
      : req.user.role === roles;
    
    // Super admin has access to everything
    if (req.user.role === 'super_admin') {
      return next();
    }
    
    if (!authorized) {
      return res.status(403).json({ message: 'Access denied. Not authorized for this action.' });
    }
    
    next();
  };
};