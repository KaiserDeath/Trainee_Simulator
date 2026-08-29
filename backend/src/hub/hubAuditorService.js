import { parseActionDetails } from '../engine/AuditLogger.js';
import {
  sanitizeAuditorActionLog,
  sanitizeAuditorJson,
  sanitizeAuditorOperation
} from '../domain/auditorEvidence.js';
import { HubError } from './HubError.js';

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireUuid(value, fieldName) {
  const normalized = String(value || '').trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw new HubError(
      400,
      'HUB_VALIDATION_ERROR',
      `${fieldName} must be a UUID.`
    );
  }
  return normalized;
}

function optionalCursor(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  return requireUuid(value, fieldName);
}

function pageLimit(value) {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_PAGE_LIMIT;
  }
  if (
    typeof value !== 'string' ||
    !/^\d+$/.test(value) ||
    Number(value) < 1 ||
    Number(value) > MAX_PAGE_LIMIT
  ) {
    throw new HubError(
      400,
      'HUB_VALIDATION_ERROR',
      `limit must be an integer from 1 to ${MAX_PAGE_LIMIT}.`
    );
  }
  return Number(value);
}

function overviewPagination(query = {}) {
  return {
    limit: pageLimit(query.limit),
    postulanteCursor: optionalCursor(query.postulanteCursor, 'postulanteCursor'),
    sessionCursor: optionalCursor(query.sessionCursor, 'sessionCursor')
  };
}

function attemptPagination(query = {}) {
  return {
    limit: pageLimit(query.limit),
    activityCursor: optionalCursor(query.activityCursor, 'activityCursor'),
    evidenceCursor: optionalCursor(query.evidenceCursor, 'evidenceCursor'),
    artifactCursor: optionalCursor(query.artifactCursor, 'artifactCursor')
  };
}

function learningRecordPagination(query = {}) {
  return {
    limit: pageLimit(query.limit),
    moduleCursor: optionalCursor(query.moduleCursor, 'moduleCursor'),
    attemptCursor: optionalCursor(query.attemptCursor, 'attemptCursor')
  };
}

function simulatorPagination(query = {}) {
  return {
    limit: pageLimit(query.limit),
    operationCursor: optionalCursor(
      query.operationCursor,
      'operationCursor'
    ),
    actionCursor: optionalCursor(query.actionCursor, 'actionCursor')
  };
}

function pageCollection(rows, { limit, cursor }) {
  const ordered = [...rows]
    .filter((row) => typeof row?.id === 'string')
    .sort((a, b) => a.id.localeCompare(b.id));
  const remaining = cursor
    ? ordered.filter((row) => row.id > cursor)
    : ordered;
  const hasMore = remaining.length > limit;
  const items = hasMore ? remaining.slice(0, limit) : remaining;
  return {
    items,
    nextCursor:
      hasMore && items.length > 0
        ? items[items.length - 1].id
        : null
  };
}

function persistenceFailure() {
  return new HubError(
    503,
    'HUB_PERSISTENCE_ERROR',
    'Hub audit data is temporarily unavailable.'
  );
}

export function createHubAuditorService({
  repository,
  sessionReportReader,
  actionLogReader
}) {
  if (!repository) throw new TypeError('A Hub auditor repository is required.');
  if (typeof sessionReportReader !== 'function') {
    throw new TypeError('A simulator session report reader is required.');
  }
  if (typeof actionLogReader !== 'function') {
    throw new TypeError('A simulator action log reader is required.');
  }

  return Object.freeze({
    async getOverview(query) {
      const overview = await repository.getOverview(
        overviewPagination(query)
      );
      return {
        generatedAt: new Date().toISOString(),
        ...overview
      };
    },

    async getHubAttempt(attemptIdValue, query) {
      const attemptId = requireUuid(attemptIdValue, 'attemptId');
      const result = await repository.getHubAttempt(
        attemptId,
        attemptPagination(query)
      );
      if (!result) {
        throw new HubError(
          404,
          'HUB_ATTEMPT_NOT_FOUND',
          'The Hub attempt was not found.'
        );
      }

      return {
        attempt: result.attempt,
        activityAttempts: result.activityAttempts.map((row) => ({
          id: row.id,
          activityId: row.activity_id,
          status: row.status,
          state: sanitizeAuditorJson(row.state),
          startedAt: row.started_at,
          completedAt: row.completed_at
        })),
        evidenceEvents: result.evidenceEvents.map((row) => ({
          id: row.id,
          activityAttemptId: row.activity_attempt_id,
          sequenceNumber: row.sequence_number,
          eventType: row.event_type,
          occurredAt: row.occurred_at,
          payload: sanitizeAuditorJson(row.payload)
        })),
        artifacts: result.artifacts.map((row) => ({
          id: row.id,
          activityAttemptId: row.activity_attempt_id,
          artifactType: row.artifact_type,
          createdAt: row.created_at,
          payload: sanitizeAuditorJson(row.payload)
        })),
        pageInfo: result.pageInfo
      };
    },

    async getTraineeLearningRecords(identityIdValue, query) {
      const identityId = requireUuid(identityIdValue, 'identityId');
      const result = await repository.getTraineeLearningRecords(
        identityId,
        learningRecordPagination(query)
      );
      if (!result) {
        throw new HubError(
          404,
          'HUB_LEARNER_NOT_FOUND',
          'The Hub Postulante was not found.'
        );
      }
      return result;
    },

    async getSimulatorSession(sessionIdValue, query) {
      const sessionId = requireUuid(sessionIdValue, 'sessionId');
      const pagination = simulatorPagination(query);
      const session = await repository.getLegacySession(sessionId);
      if (!session) {
        throw new HubError(
          404,
          'HUB_SIMULATOR_SESSION_NOT_FOUND',
          'The simulator session was not found.'
        );
      }

      let report;
      let actionLog;
      try {
        [report, actionLog] = await Promise.all([
          sessionReportReader(sessionId),
          actionLogReader(sessionId)
        ]);
      } catch {
        throw persistenceFailure();
      }

      const operationPage = pageCollection(
        Array.isArray(report?.operations) ? report.operations : [],
        {
          limit: pagination.limit,
          cursor: pagination.operationCursor
        }
      );
      const actionPage = pageCollection(
        Array.isArray(actionLog) ? actionLog : [],
        {
          limit: pagination.limit,
          cursor: pagination.actionCursor
        }
      );

      return {
        session,
        performance: sanitizeAuditorJson(report?.performance || {}),
        operationBreakdown: sanitizeAuditorJson(
          report?.operationBreakdown || {}
        ),
        operations: operationPage.items.map(sanitizeAuditorOperation),
        auditLog: actionPage.items.map((row) =>
              sanitizeAuditorActionLog(
                row,
                parseActionDetails(row.details)
              )
            ),
        pageInfo: {
          operations: {
            limit: pagination.limit,
            nextCursor: operationPage.nextCursor
          },
          auditLog: {
            limit: pagination.limit,
            nextCursor: actionPage.nextCursor
          }
        }
      };
    }
  });
}

export const HUB_RRHH_PAGE_LIMITS = Object.freeze({
  default: DEFAULT_PAGE_LIMIT,
  maximum: MAX_PAGE_LIMIT
});
