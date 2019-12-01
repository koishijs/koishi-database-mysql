import { joinKeys, formatValues } from './database'
import { isSubset } from 'koishi-utils'
import { assignees as assigneeIds, injectMethods, GroupData, createGroup, groupFields } from 'koishi-core'

type CachedGroupData = GroupData & { _timestamp: number }

const GROUP_REFRESH_INTERVAL = 60 * 1000
const groupCache: Record<number, CachedGroupData> = {}

injectMethods('mysql', {
  async getGroup (groupId, selfId = 0, fields = groupFields) {
    const timestamp = Date.now()
    const cache = groupCache[groupId]
    if (cache && isSubset(fields, Object.keys(cache)) && timestamp - cache._timestamp < GROUP_REFRESH_INTERVAL) {
      return cache
    }

    const [data] = await this.query('SELECT ' + joinKeys(fields) + ' FROM `groups` WHERE `id` = ?', [groupId]) as GroupData[]
    let fallback: GroupData
    if (!data) {
      fallback = createGroup(groupId, selfId)
      if (selfId && groupId) {
        await this.query(
          'INSERT INTO `groups` (' + joinKeys(groupFields) + ') VALUES (' + groupFields.map(() => '?').join(', ') + ')',
          formatValues('groups', fallback, groupFields),
        )
      }
    } else {
      data.id = groupId
    }

    const group = groupCache[groupId] = (data || fallback) as CachedGroupData
    Object.defineProperty(group, '_timestamp', { value: timestamp })
    return group
  },

  async getAllGroups (keys = groupFields, assignees = assigneeIds) {
    let queryString = 'SELECT ' + joinKeys(keys) + ' FROM `groups`'
    if (assignees) queryString += ` WHERE \`assignee\` IN (${assignees.join(',')})`
    return this.query(queryString)
  },

  async setGroup (groupId, data) {
    const result = await this.update('groups', groupId, data)
    if (!groupCache[groupId]) {
      groupCache[groupId] = {} as CachedGroupData
      Object.defineProperty(groupCache[groupId], '_timestamp', { value: Date.now() })
    }
    Object.assign(groupCache[groupId], data)
    return result
  },

  async getGroupCount () {
    return this.count('groups')
  },
})
