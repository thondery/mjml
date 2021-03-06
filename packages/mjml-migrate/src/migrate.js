import fs from 'fs'

import MJMLParser from 'mjml-parser-xml'
import { components } from 'mjml-core'

import { unavailableTags, attributesWithUnit } from './config'

function removeContainerTag(bodyTag) {
  bodyTag.attributes = bodyTag.children[0].attributes
  bodyTag.children = bodyTag.children[0].children

  return bodyTag
}

const listAttributes = (tag) => {
  return tag.attributes
}

function fixUnits(attribute, value) {
  let length = attributesWithUnit.length
  for (let i = 0; i < length; i++) {
    if (attributesWithUnit[i] === attribute) {
      return addPx(value)
    }
  }
  return value
}

function addPx(value) {
  if (!isNaN(value)) {
    return value + 'px'
  }
  else {
    return value
  }
}

function cleanAttributes(attributes) {
  for (let key in attributes) {
    attributes[key] = fixUnits(key, attributes[key])
  }
  return attributes
}

const DEFAULT_SOCIAL_DISPLAY = 'facebook twitter google'

function migrateSocialSyntax(socialTag) {
  const listAllNetworks = (tag) => {
    let attributes = (tag.attributes['display'] || DEFAULT_SOCIAL_DISPLAY).split(' ')
    delete(tag.attributes['display'])
    return attributes
  }

  const attributes = listAttributes(socialTag)

  const networks = listAllNetworks(socialTag)
  socialTag.children = []

  // migrate all attributes to their child attributes
  for (let network in networks) {
    socialTag.children.push({
      tagName: `mj-social-element`,
      attributes: {"name": networks[network]},
      content: attributes[`${networks[network]}-content`] ? attributes[`${networks[network]}-content`] : ''
    })

    for (let attribute in attributes) {
      if (attribute.match(networks[network]) && !attribute.match('content')) {
        socialTag.children[network].attributes[attribute.replace(`${networks[network]}-`,'')] = socialTag.attributes[attribute]
        delete(socialTag.attributes[attribute])
      }
    }
  }

  // delete all content attributes from the root tag after they've been migrated
  for (let attribute in attributes) {
    if (attribute.match('content')) {
      delete(attributes[attribute])
    }
  }

  return socialTag
}

function migrateNavbarSyntax(navbarTag) {
  navbarTag.tagName = 'mj-section'
  navbarTag.attributes['full-width'] = 'full-width'
  return navbarTag
}

function migrateHeroSyntax(heroTag) {
  const contentAttributes = listAttributes(heroTag.children[0])

  for (let attribute in contentAttributes) {
    heroTag.attributes[attribute] = heroTag.children[0].attributes[attribute]
  }

  heroTag.children = heroTag.children[0].children
  return heroTag
}

function isSupportedTag(tag) {
  const length = unavailableTags.length
  for (let i = 0; i < length; i++) {
    if (tag === unavailableTags[i]) {
      return false
    }
  }
  return true
}

function loopThrough(tree) {
  for (let key in tree) {
    if (key === 'children') {
      for (let i = 0; i < tree.children.length; i++) {
        if (isSupportedTag(tree.children[i].tagName)) {
          switch (tree.children[i].tagName) {
            case 'mj-body':
              tree.children[i] = removeContainerTag(tree.children[i])
              break
            case 'mj-social':
              tree.children[i] = migrateSocialSyntax(tree.children[i])
              break
            case 'mj-navbar':
              tree.children[i] = migrateNavbarSyntax(tree.children[i])
              break
            case 'mj-inline-links':
              tree.children[i].tagName = 'mj-navbar'
              break
            case 'mj-hero':
              tree.children[i] = migrateHeroSyntax(tree.children[i])
              break
          }

          tree.children[i].attributes = cleanAttributes(tree.children[i].attributes)
          loopThrough(tree.children[i])
        }
        else {
          console.log(`Ignoring unsupported tag : ${tree.children[i].tagName} on line ${tree.children[i].line}`)
          delete(tree.children[i])
        }
      }
    }
  }
  return tree
}

function checkV3Through(node) {
  if (node.tagName === 'mj-container') return true
  if (!node.children || !node.children.length) return false

  return node.children.some(checkV3Through)
}

export function handleMjml3(mjml) {
  const isV3Synthax = checkV3Through(mjml)
  if (!isV3Synthax) return mjml

  console.log('MJML v3 syntax detected, migrating to MJML v4 syntax. Use mjml -m to get the migrated MJML.')
  return migrate(mjml)
}

const jsonToXML = ({ tagName, attributes, children, content }) => {
  const subNode =
    children && children.length > 0
      ? children.map(jsonToXML).join("\n")
      : content ? content : '';

  const stringAttrs = Object.keys(attributes)
    .map(attr => `${attr}="${attributes[attr]}"`)
    .join(" ");

  return `<${tagName}${stringAttrs === '' ? '>' : ` ${stringAttrs}>`}${subNode}</${tagName}>`;
}

export default function migrate(input) {
  if (typeof input === 'object') return loopThrough(input)

  const mjmlJson = MJMLParser(input, { components })
  loopThrough(mjmlJson)

  return jsonToXML(mjmlJson)
}
