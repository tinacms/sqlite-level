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


import {SqliteLevel} from './index'

const ModuleError = require('module-error')

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
})
