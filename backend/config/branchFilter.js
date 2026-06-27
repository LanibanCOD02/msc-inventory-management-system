/**
 * Helper to generate an SQL WHERE clause for branch filtering based on user role.
 *
 * @param {Object} user - The authenticated user object
 * @param {String} reqQueryBranchId - Optional branch_id from request query
 * @param {Boolean} includeGlobal - Whether to include global records (branch_id IS NULL)
 * @returns {Object} An object containing { condition, params }
 */
function getBranchFilterSql(user, reqQueryBranchId, includeGlobal = false) {
  let condition = '';
  let params = [];

  if (user.role === 'Admin') {
    if (reqQueryBranchId) {
      if (includeGlobal) {
        condition = '(branch_id = ? OR branch_id IS NULL)';
      } else {
        condition = 'branch_id = ?';
      }
      params.push(reqQueryBranchId);
    } else {
      condition = '1=1'; // No filtering
    }
  } else {
    // Staff user
    if (includeGlobal) {
      condition = '(branch_id = ? OR branch_id IS NULL)';
    } else {
      condition = 'branch_id = ?';
    }
    params.push(user.branch_id);
  }

  return { condition, params };
}

/**
 * Helper to determine which branch_id to use for an INSERT operation.
 *
 * @param {Object} user - The authenticated user object
 * @param {String} bodyBranchId - Optional branch_id provided in the request body
 * @returns {String} The resolved branch_id
 */
function getBranchId(user, bodyBranchId) {
  if (user.role === 'Admin' && bodyBranchId) {
    return bodyBranchId;
  }
  return user.branch_id;
}

module.exports = {
  getBranchFilterSql,
  getBranchId
};
