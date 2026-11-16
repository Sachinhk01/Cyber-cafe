// D8: record who viewed a document, changed a status, refunded, or changed settings.
import { AuditLog } from '../models.js';

export async function audit(req, action, { targetType, targetId, summary } = {}) {
  try {
    await AuditLog.create({
      actor: req.user?.id,
      actorName: req.user?.name || 'System',
      actorRole: req.user?.role || 'system',
      action,
      targetType,
      targetId: targetId ? String(targetId) : undefined,
      summary: String(summary || '').slice(0, 300),
      ip: req.ip,
    });
  } catch (e) {
    console.error('Audit log failed:', e.message); // never block the action itself
  }
}
