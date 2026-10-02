// Enums and rules from shared/constants.json — the same file the backend reads.
import constants from '../../../../shared/constants.json'

import type { Status } from '../api/types'

export const STATUS_TRANSITIONS = constants.status_transitions as Record<Status, Status[]>
