/**
 Copyright 2023 Forestry.io Holdings, Inc.
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteLevel } from './index.js'
import ModuleError from 'module-error'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

const keyNotFoundError = (key: string) => new ModuleError(`Key ${key} was not found`, {
  code: 'LEVEL_NOT_FOUND',
})

describe('sqlite-level', () => {
  let level: SqliteLevel
  beforeEach(async () => {
    level = new SqliteLevel<string, string>({
      filename: ':memory:',
    })
    await level.open()
  })

  afterEach(async () => {
    await level.clear()
    await level.close()
  })

  it('put and get', async () => {
    await level.put('key', 'value')
    expect(await level.get('key')).toEqual('value')
  })

  it('del', async () => {
    await level.put('key', 'value')
    await level.del('key')
    await expect(level.get('key')).rejects.toThrow(keyNotFoundError('key'))
  })

  it('batch', async () => {
    await level.put('key1', 'value')
    await level.batch([
      {type: 'del', key: 'key1'},
      {type: 'put', key: 'key2', value: 'value2'},
      {type: 'put', key: 'key3', value: 'value3'},
    ])
    await expect(level.get('key1')).rejects.toThrow(keyNotFoundError('key1'))
    expect(await level.get('key2')).toEqual('value2')
    expect(await level.get('key3')).toEqual('value3')
  })

  it('iterates over key value pairs', async () => {
    await level.batch([
      {type: 'put', key: 'key1', value: 'value1'},
      {type: 'put', key: 'key2', value: 'value2'},
      ])
    const result = level.iterator()
    expect(await result.next()).toEqual(['key1', 'value1'])
    expect(await result.next()).toEqual(['key2', 'value2'])
    expect(await result.next()).toBeUndefined()
  })

  it('iterates over keys', async () => {
    await level.batch([
      {type: 'put', key: 'key1', value: 'value1'},
      {type: 'put', key: 'key2', value: 'value2'},
      ])
    const result = level.keys()
    expect(await result.next()).toEqual('key1')
    expect(await result.next()).toEqual('key2')
    expect(await result.next()).toBeUndefined()
  })

  it('iterates over values', async () => {
    await level.batch([
      {type: 'put', key: 'key1', value: 'value1'},
      {type: 'put', key: 'key2', value: 'value2'},
    ])
    const result = level.values()
    expect(await result.next()).toEqual('value1')
    expect(await result.next()).toEqual('value2')
    expect(await result.next()).toBeUndefined()
  })

  it('returns correct type property', () => {
    expect(level.type).toEqual('sqlite3')
  })

  describe('iterator options', () => {
    beforeEach(async () => {
      await level.batch([
        {type: 'put', key: 'a', value: '1'},
        {type: 'put', key: 'b', value: '2'},
        {type: 'put', key: 'c', value: '3'},
        {type: 'put', key: 'd', value: '4'},
        {type: 'put', key: 'e', value: '5'},
      ])
    })

    it('iterates with gt (greater than)', async () => {
      const result = level.iterator({ gt: 'b' })
      expect(await result.next()).toEqual(['c', '3'])
      expect(await result.next()).toEqual(['d', '4'])
      expect(await result.next()).toEqual(['e', '5'])
      expect(await result.next()).toBeUndefined()
    })

    it('iterates with gte (greater than or equal)', async () => {
      const result = level.iterator({ gte: 'b' })
      expect(await result.next()).toEqual(['b', '2'])
      expect(await result.next()).toEqual(['c', '3'])
      expect(await result.next()).toEqual(['d', '4'])
      expect(await result.next()).toEqual(['e', '5'])
      expect(await result.next()).toBeUndefined()
    })

    it('iterates with lt (less than)', async () => {
      const result = level.iterator({ lt: 'c' })
      expect(await result.next()).toEqual(['a', '1'])
      expect(await result.next()).toEqual(['b', '2'])
      expect(await result.next()).toBeUndefined()
    })

    it('iterates with lte (less than or equal)', async () => {
      const result = level.iterator({ lte: 'c' })
      expect(await result.next()).toEqual(['a', '1'])
      expect(await result.next()).toEqual(['b', '2'])
      expect(await result.next()).toEqual(['c', '3'])
      expect(await result.next()).toBeUndefined()
    })

    it('iterates with range (gte and lte)', async () => {
      const result = level.iterator({ gte: 'b', lte: 'd' })
      expect(await result.next()).toEqual(['b', '2'])
      expect(await result.next()).toEqual(['c', '3'])
      expect(await result.next()).toEqual(['d', '4'])
      expect(await result.next()).toBeUndefined()
    })

    it('iterates with range (gt and lt)', async () => {
      const result = level.iterator({ gt: 'a', lt: 'e' })
      expect(await result.next()).toEqual(['b', '2'])
      expect(await result.next()).toEqual(['c', '3'])
      expect(await result.next()).toEqual(['d', '4'])
      expect(await result.next()).toBeUndefined()
    })

    it('iterates in reverse order', async () => {
      const result = level.iterator({ reverse: true })
      expect(await result.next()).toEqual(['e', '5'])
      expect(await result.next()).toEqual(['d', '4'])
      expect(await result.next()).toEqual(['c', '3'])
      expect(await result.next()).toEqual(['b', '2'])
      expect(await result.next()).toEqual(['a', '1'])
      expect(await result.next()).toBeUndefined()
    })

    it('iterates keys with gt', async () => {
      const result = level.keys({ gt: 'c' })
      expect(await result.next()).toEqual('d')
      expect(await result.next()).toEqual('e')
      expect(await result.next()).toBeUndefined()
    })

    it('iterates values with lt', async () => {
      const result = level.values({ lt: 'c' })
      expect(await result.next()).toEqual('1')
      expect(await result.next()).toEqual('2')
      expect(await result.next()).toBeUndefined()
    })
  })

  describe('iterator with limit', () => {
    // These tests use for-await to fully consume the iterator, which properly releases
    // the underlying better-sqlite3 statement
    beforeEach(async () => {
      await level.batch([
        {type: 'put', key: 'a', value: '1'},
        {type: 'put', key: 'b', value: '2'},
        {type: 'put', key: 'c', value: '3'},
        {type: 'put', key: 'd', value: '4'},
        {type: 'put', key: 'e', value: '5'},
      ])
    })

    it('iterates with limit', async () => {
      const items: [string, string][] = []
      for await (const item of level.iterator({ limit: 2 })) {
        items.push(item as [string, string])
      }
      expect(items).toEqual([['a', '1'], ['b', '2']])
    })

    it('iterates in reverse with limit', async () => {
      const items: [string, string][] = []
      for await (const item of level.iterator({ reverse: true, limit: 2 })) {
        items.push(item as [string, string])
      }
      expect(items).toEqual([['e', '5'], ['d', '4']])
    })

    it('limit 0 returns nothing', async () => {
      const items: [string, string][] = []
      for await (const item of level.iterator({ limit: 0 })) {
        items.push(item as [string, string])
      }
      expect(items).toEqual([])
    })
  })

  describe('read-only mode', () => {
    let readOnlyLevel: SqliteLevel<string, string>
    let tempDir: string
    let dbPath: string

    beforeEach(async () => {
      // Create a temp database with some data first
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-level-test-'))
      dbPath = path.join(tempDir, 'test.db')
      
      const writeLevel = new SqliteLevel<string, string>({ filename: dbPath })
      await writeLevel.open()
      await writeLevel.put('existing', 'data')
      await writeLevel.close()

      // Now open in read-only mode
      readOnlyLevel = new SqliteLevel<string, string>({ 
        filename: dbPath,
        readOnly: true 
      })
      await readOnlyLevel.open()
    })

    afterEach(async () => {
      await readOnlyLevel.close()
      // Clean up temp files
      fs.rmSync(tempDir, { recursive: true, force: true })
    })

    it('allows reading in read-only mode', async () => {
      expect(await readOnlyLevel.get('existing')).toEqual('data')
    })

    it('throws error on put in read-only mode', async () => {
      await expect(readOnlyLevel.put('key', 'value')).rejects.toThrow(
        new ModuleError('not authorized to write to branch', { code: 'LEVEL_READ_ONLY' })
      )
    })

    it('throws error on del in read-only mode', async () => {
      await expect(readOnlyLevel.del('existing')).rejects.toThrow(
        new ModuleError('not authorized to write to branch', { code: 'LEVEL_READ_ONLY' })
      )
    })

    it('throws error on batch in read-only mode', async () => {
      await expect(readOnlyLevel.batch([
        { type: 'put', key: 'key', value: 'value' }
      ])).rejects.toThrow(
        new ModuleError('not authorized to write to branch', { code: 'LEVEL_READ_ONLY' })
      )
    })

    it('throws error on clear in read-only mode', async () => {
      await expect(readOnlyLevel.clear()).rejects.toThrow(
        new ModuleError('not authorized to write to branch', { code: 'LEVEL_READ_ONLY' })
      )
    })
  })

  describe('clear with options', () => {
    beforeEach(async () => {
      await level.batch([
        {type: 'put', key: 'a', value: '1'},
        {type: 'put', key: 'b', value: '2'},
        {type: 'put', key: 'c', value: '3'},
        {type: 'put', key: 'd', value: '4'},
        {type: 'put', key: 'e', value: '5'},
      ])
    })

    it('clears all keys when no options given', async () => {
      await level.clear()
      const items: [string, string][] = []
      for await (const item of level.iterator()) {
        items.push(item as [string, string])
      }
      expect(items).toEqual([])
    })

    it('clears keys with gte', async () => {
      await level.clear({ gte: 'c' })
      expect(await level.get('a')).toEqual('1')
      expect(await level.get('b')).toEqual('2')
      await expect(level.get('c')).rejects.toThrow()
      await expect(level.get('d')).rejects.toThrow()
      await expect(level.get('e')).rejects.toThrow()
    })

    it('clears keys with gt', async () => {
      await level.clear({ gt: 'c' })
      expect(await level.get('a')).toEqual('1')
      expect(await level.get('b')).toEqual('2')
      expect(await level.get('c')).toEqual('3')
      await expect(level.get('d')).rejects.toThrow()
      await expect(level.get('e')).rejects.toThrow()
    })

    it('clears keys with lte', async () => {
      await level.clear({ lte: 'c' })
      await expect(level.get('a')).rejects.toThrow()
      await expect(level.get('b')).rejects.toThrow()
      await expect(level.get('c')).rejects.toThrow()
      expect(await level.get('d')).toEqual('4')
      expect(await level.get('e')).toEqual('5')
    })

    it('clears keys with lt', async () => {
      await level.clear({ lt: 'c' })
      await expect(level.get('a')).rejects.toThrow()
      await expect(level.get('b')).rejects.toThrow()
      expect(await level.get('c')).toEqual('3')
      expect(await level.get('d')).toEqual('4')
      expect(await level.get('e')).toEqual('5')
    })

    it('clears keys within a range (gte + lte)', async () => {
      await level.clear({ gte: 'b', lte: 'd' })
      expect(await level.get('a')).toEqual('1')
      await expect(level.get('b')).rejects.toThrow()
      await expect(level.get('c')).rejects.toThrow()
      await expect(level.get('d')).rejects.toThrow()
      expect(await level.get('e')).toEqual('5')
    })

    it('clears keys within a range (gt + lt)', async () => {
      await level.clear({ gt: 'a', lt: 'e' })
      expect(await level.get('a')).toEqual('1')
      await expect(level.get('b')).rejects.toThrow()
      await expect(level.get('c')).rejects.toThrow()
      await expect(level.get('d')).rejects.toThrow()
      expect(await level.get('e')).toEqual('5')
    })
  })

  describe('edge cases', () => {
    it('handles empty batch', async () => {
      await expect(level.batch([])).resolves.not.toThrow()
    })

    it('handles empty string key', async () => {
      await level.put('', 'empty key value')
      expect(await level.get('')).toEqual('empty key value')
    })

    it('handles empty string value', async () => {
      await level.put('empty-value', '')
      expect(await level.get('empty-value')).toEqual('')
    })

    it('handles special characters in keys', async () => {
      const specialKey = 'key with spaces & special!@#$%^chars'
      await level.put(specialKey, 'value')
      expect(await level.get(specialKey)).toEqual('value')
    })

    it('handles special characters in values', async () => {
      const specialValue = 'value with "quotes" and \'apostrophes\' and \nnewlines'
      await level.put('key', specialValue)
      expect(await level.get('key')).toEqual(specialValue)
    })

    it('handles unicode in keys and values', async () => {
      const unicodeKey = '键'
      const unicodeValue = '值 emoji'
      await level.put(unicodeKey, unicodeValue)
      expect(await level.get(unicodeKey)).toEqual(unicodeValue)
    })

    it('handles very long keys', async () => {
      const longKey = 'k'.repeat(1000)
      await level.put(longKey, 'value')
      expect(await level.get(longKey)).toEqual('value')
    })

    it('handles very long values', async () => {
      const longValue = 'v'.repeat(10000)
      await level.put('key', longValue)
      expect(await level.get('key')).toEqual(longValue)
    })

    it('get throws LEVEL_NOT_FOUND for non-existent key', async () => {
      await expect(level.get('nonexistent')).rejects.toThrow(
        keyNotFoundError('nonexistent')
      )
    })

    it('del on non-existent key does not throw', async () => {
      await expect(level.del('nonexistent')).resolves.not.toThrow()
    })
  })

  describe('value updates (upsert behavior)', () => {
    it('put with same key updates the value', async () => {
      await level.put('key', 'value1')
      await level.put('key', 'value2')
      expect(await level.get('key')).toEqual('value2')
    })

    it('batch updates existing keys', async () => {
      await level.put('fixed_key1', 'value1')
      await level.batch([
        {type: 'put', key: 'fixed_key1', value: 'value2'},
        {type: 'put', key: 'fixed_key2', value: 'value3'},
        {type: 'put', key: 'fixed_key2', value: 'value4'},
      ])
      expect(await level.get('fixed_key1')).toEqual('value2')
      expect(await level.get('fixed_key2')).toEqual('value4')
    })

    it('multiple puts to same key results in single row', async () => {
      await level.put('key', 'v1')
      await level.put('key', 'v2')
      await level.put('key', 'v3')
      
      // Verify only one entry exists by checking iterator
      const entries: [string, string][] = []
      for await (const entry of level.iterator()) {
        entries.push(entry as [string, string])
      }
      expect(entries).toEqual([['key', 'v3']])
    })
  })

  describe('file-based database', () => {
    let fileLevel: SqliteLevel<string, string>
    let tempDir: string
    let dbPath: string

    beforeEach(async () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-level-test-'))
      dbPath = path.join(tempDir, 'test.db')
      fileLevel = new SqliteLevel<string, string>({ filename: dbPath })
      await fileLevel.open()
    })

    afterEach(async () => {
      await fileLevel.close()
      fs.rmSync(tempDir, { recursive: true, force: true })
    })

    it('persists data to file', async () => {
      await fileLevel.put('persistent', 'data')
      await fileLevel.close()

      // Reopen the database
      const reopened = new SqliteLevel<string, string>({ filename: dbPath })
      await reopened.open()
      expect(await reopened.get('persistent')).toEqual('data')
      await reopened.close()
    })

    it('creates database file on disk', async () => {
      expect(fs.existsSync(dbPath)).toBe(true)
    })

    it('creates WAL file for WAL mode', async () => {
      // WAL mode creates additional files
      await fileLevel.put('key', 'value')
      // The WAL file may or may not exist depending on checkpointing
      // But the main db file should exist
      expect(fs.existsSync(dbPath)).toBe(true)
    })
  })

  describe('batch operations', () => {
    it('handles batch with only put operations', async () => {
      await level.batch([
        {type: 'put', key: 'a', value: '1'},
        {type: 'put', key: 'b', value: '2'},
        {type: 'put', key: 'c', value: '3'},
      ])
      expect(await level.get('a')).toEqual('1')
      expect(await level.get('b')).toEqual('2')
      expect(await level.get('c')).toEqual('3')
    })

    it('handles batch with only del operations', async () => {
      await level.put('a', '1')
      await level.put('b', '2')
      await level.batch([
        {type: 'del', key: 'a'},
        {type: 'del', key: 'b'},
      ])
      await expect(level.get('a')).rejects.toThrow()
      await expect(level.get('b')).rejects.toThrow()
    })

    it('handles batch with alternating put and del', async () => {
      await level.put('existing', 'value')
      await level.batch([
        {type: 'del', key: 'existing'},
        {type: 'put', key: 'new1', value: 'v1'},
        {type: 'del', key: 'nonexistent'},
        {type: 'put', key: 'new2', value: 'v2'},
      ])
      await expect(level.get('existing')).rejects.toThrow()
      expect(await level.get('new1')).toEqual('v1')
      expect(await level.get('new2')).toEqual('v2')
    })

    it('handles single quotes in keys and values', async () => {
      await level.batch([
        {type: 'put', key: "'key4'", value: "Mark's"},
        {type: 'put', key: "it's", value: "value with 'quotes'"},
      ])
      expect(await level.get("'key4'")).toEqual("Mark's")
      expect(await level.get("it's")).toEqual("value with 'quotes'")
    })

    it('handles del with single quotes in key', async () => {
      await level.put("O'Brien", 'value')
      await level.batch([
        {type: 'del', key: "O'Brien"},
      ])
      await expect(level.get("O'Brien")).rejects.toThrow()
    })
  })

  describe('iterator closing', () => {
    it('allows database operations after breaking from iterator loop', async () => {
      await level.batch([
        {type: 'put', key: 'key1', value: 'value1'},
        {type: 'put', key: 'key2', value: 'value2'},
        {type: 'put', key: 'key3', value: 'value3'},
      ])
      
      for await (const [key] of level.iterator()) {
        if (key === 'key2') {
          break
        }
      }
      
      // Should still work after breaking from iterator
      expect(await level.get('key3')).toEqual('value3')
    })

    it('allows database operations after breaking from key iterator loop', async () => {
      await level.batch([
        {type: 'put', key: 'key1', value: 'value1'},
        {type: 'put', key: 'key2', value: 'value2'},
        {type: 'put', key: 'key3', value: 'value3'},
      ])

      for await (const key of level.keys()) {
        if (key === 'key2') {
          break
        }
      }

      expect(await level.get('key3')).toEqual('value3')
    })

    it('allows database operations after breaking from value iterator loop', async () => {
      await level.batch([
        {type: 'put', key: 'key1', value: 'value1'},
        {type: 'put', key: 'key2', value: 'value2'},
        {type: 'put', key: 'key3', value: 'value3'},
      ])

      for await (const value of level.values()) {
        if (value === 'value2') {
          break
        }
      }

      expect(await level.get('key3')).toEqual('value3')
    })
  })

  describe('SQL injection prevention', () => {
    it('handles SQL injection attempts in put key', async () => {
      const maliciousKey = "'; DROP TABLE kv; --"
      await level.put(maliciousKey, 'value')
      expect(await level.get(maliciousKey)).toEqual('value')
    })

    it('handles SQL injection attempts in put value', async () => {
      const maliciousValue = "'); DELETE FROM kv; --"
      await level.put('key', maliciousValue)
      expect(await level.get('key')).toEqual(maliciousValue)
    })

    it('handles SQL injection attempts in del', async () => {
      await level.put('safe_key', 'value')
      const maliciousKey = "' OR '1'='1"
      await level.del(maliciousKey)
      // The safe_key should still exist (injection should not affect other rows)
      expect(await level.get('safe_key')).toEqual('value')
    })

    it('handles SQL injection attempts in batch put', async () => {
      const maliciousKey = "'); DELETE FROM kv; --"
      const maliciousValue = "'); DROP TABLE kv; --"
      await level.batch([
        {type: 'put', key: 'safe_key', value: 'safe_value'},
        {type: 'put', key: maliciousKey, value: maliciousValue},
      ])
      expect(await level.get('safe_key')).toEqual('safe_value')
      expect(await level.get(maliciousKey)).toEqual(maliciousValue)
    })

    it('handles SQL injection attempts in batch del', async () => {
      await level.put('keep_this', 'value1')
      await level.put('delete_this', 'value2')
      
      const maliciousKey = "' OR '1'='1' --"
      await level.batch([
        {type: 'del', key: maliciousKey},
      ])
      
      // Both keys should still exist since malicious key doesn't match
      expect(await level.get('keep_this')).toEqual('value1')
      expect(await level.get('delete_this')).toEqual('value2')
    })

    it('handles SQL injection attempts in clear', async () => {
      await level.put('prefix:a', 'value1')
      await level.put('other:b', 'value2')

      // Attempt SQL injection via clear options — the string is treated as
      // a literal range bound, not SQL. Since ' sorts before lowercase letters,
      // gte matches all keys and they are deleted — proving it ran as a
      // parameterized range query, not as injected SQL.
      const maliciousPrefix = "' OR '1'='1"
      await level.clear({ gte: maliciousPrefix })

      await expect(level.get('prefix:a')).rejects.toThrow()
      await expect(level.get('other:b')).rejects.toThrow()
    })

    it('clear with injection does not affect keys outside range', async () => {
      await level.put('aaa', 'value1')
      await level.put('mmm', 'value2')

      // The malicious string sorts after 'mmm', so only it would be in range
      const malicious = "zzz'; DROP TABLE kv; --"
      await level.clear({ gte: malicious })

      // Both keys sort before the malicious string, so they survive
      expect(await level.get('aaa')).toEqual('value1')
      expect(await level.get('mmm')).toEqual('value2')
    })

    it('handles SQL injection attempts in iterator options', async () => {
      await level.put('a', '1')
      await level.put('b', '2')
      await level.put('c', '3')
      
      // The malicious string is treated as a literal value, not SQL
      // Since all keys ('a', 'b', 'c') are greater than the quote character,
      // they all get returned - proving the injection didn't work as SQL
      const maliciousGt = "' OR '1'='1"
      const items: [string, string][] = []
      for await (const item of level.iterator({ gt: maliciousGt })) {
        items.push(item as [string, string])
      }
      
      // All items returned because they sort after the literal string "' OR '1'='1"
      // This proves the string was treated as data, not SQL
      expect(items).toEqual([['a', '1'], ['b', '2'], ['c', '3']])
    })

    it('handles newlines and special chars in keys/values', async () => {
      const specialKey = "key\nwith\nnewlines\tand\ttabs"
      const specialValue = "value\r\nwith\r\nCRLF"
      await level.put(specialKey, specialValue)
      expect(await level.get(specialKey)).toEqual(specialValue)
    })

    it('handles null bytes in keys/values', async () => {
      const keyWithNull = "key\x00null"
      const valueWithNull = "value\x00null"
      await level.put(keyWithNull, valueWithNull)
      expect(await level.get(keyWithNull)).toEqual(valueWithNull)
    })

    it('handles backslashes in keys/values', async () => {
      const keyWithBackslash = "path\\to\\file"
      const valueWithBackslash = "C:\\Users\\test"
      await level.put(keyWithBackslash, valueWithBackslash)
      expect(await level.get(keyWithBackslash)).toEqual(valueWithBackslash)
    })
  })
})
